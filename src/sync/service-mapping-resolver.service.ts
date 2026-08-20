import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

export interface LeyrTarget {
  careUnitId: string;
  emr: string;
  healthcareServiceId: string;
  resourceId: string;
}

export interface GhlTarget {
  calendarId: string;
  groupId: string;
  locationId: string;
  assignedUserId?: string;
}

@Injectable()
export class ServiceMappingResolverService {
  private readonly logger = new Logger(ServiceMappingResolverService.name);
  private readonly defaultLeyrEmr: string;
  private readonly defaultLeyrCareUnitId: string;
  private readonly defaultLeyrHealthcareServiceId: string;
  private readonly defaultLeyrResourceId: string;
  private readonly defaultGhlLocationId: string;
  private readonly defaultGhlCalendarId: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.defaultLeyrEmr = this.config.get<string>('LEYR_EMR', 'opus');
    this.defaultLeyrCareUnitId = this.config.get<string>(
      'SYNC_LEYR_DEFAULT_CARE_UNIT_ID',
      '',
    );
    this.defaultLeyrHealthcareServiceId = this.config.get<string>(
      'SYNC_LEYR_DEFAULT_HEALTHCARE_SERVICE_ID',
      '',
    );
    this.defaultLeyrResourceId = this.config.get<string>(
      'SYNC_LEYR_DEFAULT_RESOURCE_ID',
      '',
    );
    this.defaultGhlLocationId = this.config.get<string>(
      'SYNC_GHL_DEFAULT_LOCATION_ID',
      this.config.get<string>(
        'GHL_LOCATION_ID_OAUTH',
        this.config.get<string>('GHL_LOCATION_ID', ''),
      ),
    );
    this.defaultGhlCalendarId = this.config.get<string>(
      'SYNC_GHL_DEFAULT_CALENDAR_ID',
      this.config.get<string>('GHL_CALENDAR_ID', ''),
    );
  }

  /**
   * Resolve GHL calendar + staff → Leyr care unit, healthcare service, resource, EMR.
   */
  async resolveLeyrTarget(
    ghlCalendarId: string,
    ghlAssignedUserId?: string | null,
  ): Promise<LeyrTarget> {
    const calendarMapping = await this.prisma.calendarServiceMapping.findUnique(
      {
        where: { ghlCalendarId },
        include: { facility: true },
      },
    );

    if (!calendarMapping) {
      this.logger.warn(
        `No CalendarServiceMapping for GHL calendar ${ghlCalendarId} — using env defaults`,
      );
      return this.leyrFallback(ghlAssignedUserId);
    }

    const { facility } = calendarMapping;
    let resourceId = this.defaultLeyrResourceId;

    if (ghlAssignedUserId) {
      const staffMapping = await this.prisma.staffResourceMapping.findUnique({
        where: {
          ghlUserId_facilityMappingId: {
            ghlUserId: ghlAssignedUserId,
            facilityMappingId: facility.id,
          },
        },
      });

      if (staffMapping) {
        resourceId = staffMapping.leyrResourceId;
      } else {
        this.logger.warn(
          `No StaffResourceMapping for GHL user ${ghlAssignedUserId} in facility ${facility.id} — using default resource`,
        );
      }
    }

    return {
      careUnitId: facility.leyrCareUnitId,
      emr: facility.leyrEmr,
      healthcareServiceId: calendarMapping.leyrHealthcareServiceId,
      resourceId,
    };
  }

  /**
   * Resolve Leyr care unit + healthcare service + resource → GHL calendar, location, assigned user.
   */
  async resolveGhlTarget(
    leyrCareUnitId: string,
    leyrEmr: string,
    leyrHealthcareServiceId: string,
    leyrResourceId?: string | null,
  ): Promise<GhlTarget> {
    const facilityMapping = await this.prisma.facilityMapping.findUnique({
      where: {
        leyrCareUnitId_leyrEmr: { leyrCareUnitId, leyrEmr },
      },
    });

    if (!facilityMapping) {
      this.logger.warn(
        `No FacilityMapping for Leyr care unit ${leyrCareUnitId} (emr=${leyrEmr}) — using env defaults`,
      );
      return this.ghlFallback();
    }

    const calendarMapping = await this.prisma.calendarServiceMapping.findUnique(
      {
        where: {
          leyrHealthcareServiceId_facilityMappingId: {
            leyrHealthcareServiceId,
            facilityMappingId: facilityMapping.id,
          },
        },
      },
    );

    if (!calendarMapping) {
      this.logger.warn(
        `No CalendarServiceMapping for Leyr service ${leyrHealthcareServiceId} in facility ${facilityMapping.id} — using default calendar`,
      );
      return {
        calendarId: this.defaultGhlCalendarId,
        groupId: facilityMapping.ghlGroupId,
        locationId: facilityMapping.ghlLocationId,
        assignedUserId: undefined,
      };
    }

    let assignedUserId: string | undefined;

    if (leyrResourceId) {
      const staffMapping = await this.prisma.staffResourceMapping.findUnique({
        where: {
          leyrResourceId_facilityMappingId: {
            leyrResourceId,
            facilityMappingId: facilityMapping.id,
          },
        },
      });

      if (staffMapping) {
        assignedUserId = staffMapping.ghlUserId;
      } else {
        this.logger.warn(
          `No StaffResourceMapping for Leyr resource ${leyrResourceId} in facility ${facilityMapping.id}`,
        );
      }
    }

    return {
      calendarId: calendarMapping.ghlCalendarId,
      groupId: facilityMapping.ghlGroupId,
      locationId: facilityMapping.ghlLocationId,
      assignedUserId,
    };
  }

  private async leyrFallback(
    ghlAssignedUserId?: string | null,
  ): Promise<LeyrTarget> {
    let resourceId = this.defaultLeyrResourceId;

    if (ghlAssignedUserId) {
      const anyStaffMapping = await this.prisma.staffResourceMapping.findFirst({
        where: { ghlUserId: ghlAssignedUserId },
      });
      if (anyStaffMapping) {
        resourceId = anyStaffMapping.leyrResourceId;
      }
    }

    return {
      careUnitId: this.defaultLeyrCareUnitId,
      emr: this.defaultLeyrEmr,
      healthcareServiceId: this.defaultLeyrHealthcareServiceId,
      resourceId,
    };
  }

  private ghlFallback(): GhlTarget {
    return {
      calendarId: this.defaultGhlCalendarId,
      groupId: '',
      locationId: this.defaultGhlLocationId,
      assignedUserId: undefined,
    };
  }
}

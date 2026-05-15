import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { GohighlevelService } from '../integrations/gohighlevel/gohighlevel.service';
import { LeyrService } from '../integrations/leyr/leyr.service';
import {
  CreateFacilityMappingDto,
  CreateCalendarServiceMappingDto,
  CreateStaffResourceMappingDto,
  DiscoverMappingsQueryDto,
} from './dto/mappings.dto';

interface GhlGroup {
  id: string;
  name?: string;
  locationId?: string;
}

interface GhlCalendar {
  id: string;
  name?: string;
  calendarType?: string;
  groupId?: string;
  teamMembers?: Array<{
    userId?: string;
    name?: string;
    email?: string;
  }>;
}

interface LeyrCareUnit {
  id: string;
  emr_id?: string;
  name?: string;
}

interface LeyrHealthcareService {
  id: string;
  emr_id?: string;
  name?: string;
}

interface LeyrResource {
  id: string;
  emr_id?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  emails?: string[];
}

@ApiTags('Sync Mappings')
@Controller('sync/mappings')
export class MappingsController {
  private readonly defaultGhlLocationId: string;
  private readonly defaultLeyrEmr: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ghlService: GohighlevelService,
    private readonly leyrService: LeyrService,
    private readonly config: ConfigService,
  ) {
    this.defaultGhlLocationId = this.config.get<string>(
      'SYNC_GHL_DEFAULT_LOCATION_ID',
      this.config.get<string>(
        'GHL_LOCATION_ID_OAUTH',
        this.config.get<string>('GHL_LOCATION_ID', ''),
      ),
    );
    this.defaultLeyrEmr = this.config.get<string>('LEYR_EMR', 'opus');
  }

  // -------------------------------------------------------------------------
  // List all mappings
  // -------------------------------------------------------------------------

  @Get()
  @ApiOperation({ summary: 'List all facility, calendar, and staff mappings' })
  async listAll() {
    const facilities = await this.prisma.facilityMapping.findMany({
      include: {
        calendarMappings: true,
        staffMappings: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return { facilities };
  }

  // -------------------------------------------------------------------------
  // Facility (Group ↔ Care Unit)
  // -------------------------------------------------------------------------

  @Post('facilities')
  @ApiOperation({ summary: 'Create a facility mapping (Calendar Group ↔ Care Unit)' })
  async createFacility(@Body() dto: CreateFacilityMappingDto) {
    return this.prisma.facilityMapping.create({ data: dto });
  }

  @Delete('facilities/:id')
  @ApiOperation({ summary: 'Delete a facility mapping and all its children' })
  @ApiParam({ name: 'id', description: 'FacilityMapping ID' })
  async deleteFacility(@Param('id') id: string) {
    await this.prisma.facilityMapping.delete({ where: { id } });
    return { deleted: true };
  }

  // -------------------------------------------------------------------------
  // Calendar ↔ Healthcare Service
  // -------------------------------------------------------------------------

  @Post('calendars')
  @ApiOperation({ summary: 'Create a calendar-service mapping (Service Calendar ↔ Healthcare Service)' })
  async createCalendarService(@Body() dto: CreateCalendarServiceMappingDto) {
    const facility = await this.prisma.facilityMapping.findUnique({
      where: { id: dto.facilityMappingId },
    });
    if (!facility) {
      throw new HttpException(
        `FacilityMapping ${dto.facilityMappingId} not found`,
        404,
      );
    }

    return this.prisma.calendarServiceMapping.create({ data: dto });
  }

  @Delete('calendars/:id')
  @ApiOperation({ summary: 'Delete a calendar-service mapping' })
  @ApiParam({ name: 'id', description: 'CalendarServiceMapping ID' })
  async deleteCalendarService(@Param('id') id: string) {
    await this.prisma.calendarServiceMapping.delete({ where: { id } });
    return { deleted: true };
  }

  // -------------------------------------------------------------------------
  // Staff ↔ Resource
  // -------------------------------------------------------------------------

  @Post('staff')
  @ApiOperation({ summary: 'Create a staff-resource mapping (Staff Member ↔ Resource)' })
  async createStaffResource(@Body() dto: CreateStaffResourceMappingDto) {
    const facility = await this.prisma.facilityMapping.findUnique({
      where: { id: dto.facilityMappingId },
    });
    if (!facility) {
      throw new HttpException(
        `FacilityMapping ${dto.facilityMappingId} not found`,
        404,
      );
    }

    return this.prisma.staffResourceMapping.create({ data: dto });
  }

  @Delete('staff/:id')
  @ApiOperation({ summary: 'Delete a staff-resource mapping' })
  @ApiParam({ name: 'id', description: 'StaffResourceMapping ID' })
  async deleteStaffResource(@Param('id') id: string) {
    await this.prisma.staffResourceMapping.delete({ where: { id } });
    return { deleted: true };
  }

  // -------------------------------------------------------------------------
  // Auto-discovery
  // -------------------------------------------------------------------------

  @Post('discover')
  @ApiOperation({
    summary:
      'Fetch GHL groups/calendars/staff and Leyr care units/services/resources, ' +
      'then return a proposed mapping based on name similarity',
  })
  async discoverMappings(@Query() query: DiscoverMappingsQueryDto) {
    const locationId = query.ghlLocationId || this.defaultGhlLocationId;
    const emr = query.leyrEmr || this.defaultLeyrEmr;

    if (!locationId) {
      throw new HttpException(
        'Missing ghlLocationId — pass it in query or set SYNC_GHL_DEFAULT_LOCATION_ID',
        400,
      );
    }

    // Fetch from both systems in parallel
    const [ghlGroupsRaw, leyrCareUnitsRaw] = await Promise.all([
      this.ghlService.getCalendarGroups({ locationId }),
      this.leyrService.getCareUnits(emr),
    ]);

    const ghlGroups = extractArray<GhlGroup>(ghlGroupsRaw, 'groups');
    const leyrCareUnits = extractArray<LeyrCareUnit>(leyrCareUnitsRaw);

    // For each GHL group, fetch its calendars
    const groupDetails = await Promise.all(
      ghlGroups.map(async (group) => {
        const calendarsRaw = await this.ghlService.getCalendars({
          locationId,
          groupId: group.id,
        });
        const calendars = extractArray<GhlCalendar>(calendarsRaw, 'calendars');
        return { group, calendars };
      }),
    );

    // For each Leyr care unit, fetch services and resources
    const careUnitDetails = await Promise.all(
      leyrCareUnits.map(async (cu) => {
        const cuId = cu.id ?? cu.emr_id ?? '';
        const [servicesRaw, resourcesRaw] = await Promise.all([
          this.leyrService.getHealthcareServices(cuId, emr),
          this.leyrService.getResources(cuId, emr),
        ]);
        return {
          careUnit: cu,
          services: extractArray<LeyrHealthcareService>(servicesRaw),
          resources: extractArray<LeyrResource>(resourcesRaw),
        };
      }),
    );

    // Build proposed facility mappings by fuzzy-matching group names to care unit names
    const proposedFacilities = ghlGroups.map((group) => {
      const bestCareUnit = findBestMatch(
        group.name ?? '',
        careUnitDetails.map((d) => ({
          label: d.careUnit.name ?? '',
          item: d,
        })),
      );

      return {
        ghl: {
          groupId: group.id,
          groupName: group.name,
          locationId,
        },
        leyr: bestCareUnit
          ? {
              careUnitId: bestCareUnit.careUnit.id ?? bestCareUnit.careUnit.emr_id,
              careUnitName: bestCareUnit.careUnit.name,
              emr,
            }
          : null,
        confidence: bestCareUnit ? 'name_match' : 'no_match',
      };
    });

    // Build proposed calendar mappings
    const proposedCalendars = groupDetails.flatMap(({ group, calendars }) => {
      const matchedCareUnit = careUnitDetails.find((d) => {
        const proposed = proposedFacilities.find(
          (f) => f.ghl.groupId === group.id,
        );
        if (!proposed?.leyr) return false;
        const cuId = d.careUnit.id ?? d.careUnit.emr_id;
        return cuId === proposed.leyr.careUnitId;
      });

      return calendars.map((cal) => {
        const bestService = matchedCareUnit
          ? findBestMatch(
              cal.name ?? '',
              matchedCareUnit.services.map((s) => ({
                label: s.name ?? '',
                item: s,
              })),
            )
          : null;

        return {
          ghl: {
            calendarId: cal.id,
            calendarName: cal.name,
            groupId: group.id,
          },
          leyr: bestService
            ? {
                healthcareServiceId: bestService.id ?? bestService.emr_id,
                serviceName: bestService.name,
              }
            : null,
          confidence: bestService ? 'name_match' : 'no_match',
        };
      });
    });

    // Build proposed staff mappings from calendar teamMembers
    const proposedStaff = groupDetails.flatMap(({ group, calendars }) => {
      const matchedCareUnit = careUnitDetails.find((d) => {
        const proposed = proposedFacilities.find(
          (f) => f.ghl.groupId === group.id,
        );
        if (!proposed?.leyr) return false;
        const cuId = d.careUnit.id ?? d.careUnit.emr_id;
        return cuId === proposed.leyr.careUnitId;
      });

      const seenUserIds = new Set<string>();

      return calendars.flatMap((cal) => {
        const members = cal.teamMembers ?? [];
        return members
          .filter((m) => {
            if (!m.userId || seenUserIds.has(m.userId)) return false;
            seenUserIds.add(m.userId);
            return true;
          })
          .map((member) => {
            const bestResource = matchedCareUnit
              ? findBestMatch(
                  member.name ?? '',
                  matchedCareUnit.resources.map((r) => ({
                    label:
                      r.name ??
                      [r.first_name, r.last_name].filter(Boolean).join(' '),
                    item: r,
                  })),
                )
              : null;

            return {
              ghl: {
                userId: member.userId,
                userName: member.name,
                userEmail: member.email,
                groupId: group.id,
              },
              leyr: bestResource
                ? {
                    resourceId: bestResource.id ?? bestResource.emr_id,
                    resourceName:
                      bestResource.name ??
                      [bestResource.first_name, bestResource.last_name]
                        .filter(Boolean)
                        .join(' '),
                  }
                : null,
              confidence: bestResource ? 'name_match' : 'no_match',
            };
          });
      });
    });

    return {
      ghlSummary: {
        locationId,
        groupCount: ghlGroups.length,
        calendarCount: groupDetails.reduce(
          (sum, g) => sum + g.calendars.length,
          0,
        ),
      },
      leyrSummary: {
        emr,
        careUnitCount: leyrCareUnits.length,
        serviceCount: careUnitDetails.reduce(
          (sum, d) => sum + d.services.length,
          0,
        ),
        resourceCount: careUnitDetails.reduce(
          (sum, d) => sum + d.resources.length,
          0,
        ),
      },
      proposed: {
        facilities: proposedFacilities,
        calendars: proposedCalendars,
        staff: proposedStaff,
      },
      raw: {
        ghlGroups: groupDetails,
        leyrCareUnits: careUnitDetails,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractArray<T>(data: unknown, key?: string): T[] {
  if (Array.isArray(data)) return data as T[];
  if (key && data && typeof data === 'object' && key in data) {
    const nested = (data as Record<string, unknown>)[key];
    if (Array.isArray(nested)) return nested as T[];
  }
  return [];
}

/**
 * Very simple fuzzy match: normalized lowercase containment or equality.
 * Returns the best matching item or null.
 */
function findBestMatch<T>(
  needle: string,
  candidates: Array<{ label: string; item: T }>,
): T | null {
  if (!needle || candidates.length === 0) return null;

  const norm = needle.toLowerCase().trim();
  if (!norm) return null;

  // Exact match
  const exact = candidates.find(
    (c) => c.label.toLowerCase().trim() === norm,
  );
  if (exact) return exact.item;

  // Substring match (needle in candidate or candidate in needle)
  const substring = candidates.find((c) => {
    const cNorm = c.label.toLowerCase().trim();
    return cNorm.includes(norm) || norm.includes(cNorm);
  });
  if (substring) return substring.item;

  // Word overlap: count shared words
  const needleWords = new Set(norm.split(/\s+/));
  let bestOverlap = 0;
  let bestCandidate: T | null = null;

  for (const c of candidates) {
    const cWords = c.label.toLowerCase().trim().split(/\s+/);
    const overlap = cWords.filter((w) => needleWords.has(w)).length;
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestCandidate = c.item;
    }
  }

  return bestOverlap > 0 ? bestCandidate : null;
}

import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IdentityMapping } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GohighlevelService } from '../integrations/gohighlevel/gohighlevel.service';
import { LeyrService } from '../integrations/leyr/leyr.service';

interface LeyrPatientRecord {
  id?: string;
  emr_id?: string;
  first_name?: string | null;
  last_name?: string | null;
  birth_datetime?: string | null;
  phones?: string[];
  emails?: string[];
  external_id?: string | null;
  gender?: string | null;
  addresses?: Array<{
    use?: string;
    line?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  }>;
}

interface GhlContactCustomField {
  id?: string;
  key?: string;
  value?: unknown;
  field_value?: unknown;
}

interface GhlContactRecord {
  id?: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  address1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  customFields?: GhlContactCustomField[];
}

@Injectable()
export class IdentityResolverService {
  private readonly logger = new Logger(IdentityResolverService.name);
  private readonly defaultLeyrEmr: string;
  private readonly defaultLeyrCareUnitId: string;
  private readonly defaultGhlLocationId: string;
  private readonly emrsWithoutPatientSearch: Set<string>;
  private readonly personnummerFieldId: string;
  private readonly emrsRequiringPersonnummer: Set<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ghlService: GohighlevelService,
    private readonly leyrService: LeyrService,
    private readonly config: ConfigService,
  ) {
    this.defaultLeyrEmr = this.config.get<string>('LEYR_EMR', 'opus');
    this.defaultLeyrCareUnitId = this.config.get<string>(
      'SYNC_LEYR_DEFAULT_CARE_UNIT_ID',
      '',
    );
    this.defaultGhlLocationId = this.config.get<string>(
      'SYNC_GHL_DEFAULT_LOCATION_ID',
      this.config.get<string>(
        'GHL_LOCATION_ID_OAUTH',
        this.config.get<string>('GHL_LOCATION_ID', ''),
      ),
    );

    const emrsWithoutSearch = this.config.get<string>(
      'LEYR_EMRS_WITHOUT_PATIENT_SEARCH',
      'opus',
    );
    this.emrsWithoutPatientSearch = new Set(
      emrsWithoutSearch
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    );

    this.personnummerFieldId = this.config.get<string>(
      'SYNC_GHL_PERSONNUMMER_FIELD_ID',
      '',
    );

    const emrsRequiringPersonnummer = this.config.get<string>(
      'SYNC_LEYR_EMRS_REQUIRING_PERSONNUMMER',
      'opus',
    );
    this.emrsRequiringPersonnummer = new Set(
      emrsRequiringPersonnummer
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    );
  }

  /**
   * Resolve Leyr care unit + EMR from FacilityMapping for the GHL location,
   * falling back to env defaults when no mapping exists.
   */
  private async resolveCareUnitForLocation(
    ghlLocationId: string,
  ): Promise<{ careUnitId: string; emr: string }> {
    const facility = await this.prisma.facilityMapping.findFirst({
      where: { ghlLocationId },
    });

    if (facility) {
      return {
        careUnitId: facility.leyrCareUnitId,
        emr: facility.leyrEmr,
      };
    }

    if (!this.defaultLeyrCareUnitId) {
      throw new Error(
        `No FacilityMapping for GHL location ${ghlLocationId} and SYNC_LEYR_DEFAULT_CARE_UNIT_ID is not configured — cannot search/create Leyr patients`,
      );
    }

    this.logger.warn(
      `No FacilityMapping for GHL location ${ghlLocationId} — using SYNC_LEYR_DEFAULT_CARE_UNIT_ID`,
    );

    return {
      careUnitId: this.defaultLeyrCareUnitId,
      emr: this.defaultLeyrEmr,
    };
  }

  /**
   * Some EMRs (e.g. Opus) do not implement GET /patients (search) — the
   * endpoint returns 501. For those we skip search and create directly.
   */
  private supportsPatientSearch(emr: string): boolean {
    return !this.emrsWithoutPatientSearch.has(emr.toLowerCase());
  }

  /**
   * Given a GHL contact, find or create the corresponding Leyr patient
   * and return the persistent identity link.
   */
  async resolveLeyrPatient(
    ghlContactId: string,
    ghlLocationId: string,
  ): Promise<IdentityMapping> {
    const existing = await this.prisma.identityMapping.findUnique({
      where: {
        ghlContactId_ghlLocationId: {
          ghlContactId,
          ghlLocationId,
        },
      },
    });
    if (existing) return existing;

    const contactResponse = await this.ghlService.getContact(ghlContactId, {
      locationId: ghlLocationId,
    });
    const contact = ((contactResponse as { contact?: GhlContactRecord })
      ?.contact ?? contactResponse) as GhlContactRecord;

    const firstName = contact.firstName ?? null;
    const lastName = contact.lastName ?? null;
    const email = contact.email ?? null;
    const phone = contact.phone ?? null;
    const dateOfBirth = contact.dateOfBirth ?? null;

    if (!firstName && !lastName) {
      throw new Error(
        `GHL contact ${ghlContactId} has no name — cannot resolve Leyr patient`,
      );
    }

    const { careUnitId, emr } =
      await this.resolveCareUnitForLocation(ghlLocationId);

    let leyrPatientId: string;

    const matchedPatient = this.supportsPatientSearch(emr)
      ? await this.findMatchingLeyrPatient(
          careUnitId,
          emr,
          firstName,
          lastName,
          dateOfBirth,
          phone,
          email,
        )
      : null;

    if (matchedPatient) {
      leyrPatientId = String(matchedPatient.id ?? matchedPatient.emr_id);
      this.logger.log(
        `Matched GHL contact ${ghlContactId} → existing Leyr patient ${leyrPatientId}`,
      );
    } else {
      if (!this.supportsPatientSearch(emr)) {
        this.logger.log(
          `EMR "${emr}" has no patient search — creating patient directly (idempotent, EHR dedupes)`,
        );
      }
      const personnummer = this.extractPersonnummer(contact);

      leyrPatientId = await this.createLeyrPatientFromGhlContact(
        careUnitId,
        emr,
        ghlContactId,
        firstName,
        lastName,
        email,
        phone,
        dateOfBirth,
        personnummer,
      );
      this.logger.log(
        `Created new Leyr patient ${leyrPatientId} for GHL contact ${ghlContactId}`,
      );
    }

    return this.prisma.identityMapping.create({
      data: {
        ghlContactId,
        ghlLocationId,
        leyrPatientId,
        leyrEmr: emr,
        leyrCareUnitId: careUnitId,
        firstName,
        lastName,
        email,
        phone,
        dateOfBirth,
      },
    });
  }

  /**
   * Given a Leyr patient, find or create the corresponding GHL contact
   * and return the persistent identity link.
   */
  async resolveGhlContact(
    leyrPatientId: string,
    leyrEmr: string,
    leyrCareUnitId: string,
    fallback?: {
      firstName?: string | null;
      lastName?: string | null;
      email?: string | null;
      phone?: string | null;
    },
  ): Promise<IdentityMapping> {
    const existing = await this.prisma.identityMapping.findUnique({
      where: {
        leyrPatientId_leyrEmr_leyrCareUnitId: {
          leyrPatientId,
          leyrEmr,
          leyrCareUnitId,
        },
      },
    });
    if (existing) return existing;

    let patient: LeyrPatientRecord = {};
    try {
      const patientResponse = await this.leyrService.getPatient(
        leyrCareUnitId,
        leyrPatientId,
        leyrEmr,
      );
      patient = (patientResponse ?? {}) as LeyrPatientRecord;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (fallback && (fallback.firstName || fallback.lastName)) {
        this.logger.warn(
          `getPatient failed for Leyr patient ${leyrPatientId} (${msg}) — using appointment participant data as fallback`,
        );
        patient = {
          first_name: fallback.firstName ?? null,
          last_name: fallback.lastName ?? null,
          emails: fallback.email ? [fallback.email] : [],
          phones: fallback.phone ? [fallback.phone] : [],
        };
      } else {
        throw err;
      }
    }

    const firstName = patient.first_name ?? null;
    const lastName = patient.last_name ?? null;
    const email = patient.emails?.[0] ?? null;
    const phone = patient.phones?.[0] ?? null;
    const dateOfBirth = patient.birth_datetime ?? null;

    if (!firstName && !lastName) {
      throw new Error(
        `Leyr patient ${leyrPatientId} has no name — cannot resolve GHL contact`,
      );
    }

    const locationId = this.defaultGhlLocationId;
    if (!locationId) {
      throw new Error(
        'SYNC_GHL_DEFAULT_LOCATION_ID is not configured — cannot search/create GHL contacts',
      );
    }

    const matchedContact = await this.findMatchingGhlContact(
      locationId,
      firstName,
      lastName,
      dateOfBirth,
      phone,
    );

    let ghlContactId: string;

    if (matchedContact) {
      ghlContactId = String(matchedContact.id);
      this.logger.log(
        `Matched Leyr patient ${leyrPatientId} → existing GHL contact ${ghlContactId}`,
      );
    } else {
      ghlContactId = await this.createGhlContactFromLeyrPatient(
        locationId,
        firstName,
        lastName,
        email,
        phone,
        dateOfBirth,
        patient,
      );
      this.logger.log(
        `Created new GHL contact ${ghlContactId} for Leyr patient ${leyrPatientId}`,
      );
    }

    return this.prisma.identityMapping.create({
      data: {
        ghlContactId,
        ghlLocationId: locationId,
        leyrPatientId,
        leyrEmr,
        leyrCareUnitId,
        firstName,
        lastName,
        email,
        phone,
        dateOfBirth,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Leyr patient matching & creation
  // ---------------------------------------------------------------------------

  private async findMatchingLeyrPatient(
    careUnitId: string,
    emr: string,
    firstName: string | null,
    lastName: string | null,
    dateOfBirth: string | null,
    phone: string | null,
    email: string | null,
  ): Promise<LeyrPatientRecord | null> {
    if (!firstName && !lastName) return null;

    let results: unknown;
    try {
      results = await this.leyrService.findPatients(
        careUnitId,
        firstName ?? undefined,
        lastName ?? undefined,
        emr,
      );
    } catch (err) {
      if (err instanceof HttpException && err.getStatus() === 501) {
        this.logger.warn(
          `findPatients not implemented for EMR "${emr}" — falling back to create-only`,
        );
        return null;
      }
      throw err;
    }

    const patients = (
      Array.isArray(results) ? results : []
    ) as LeyrPatientRecord[];

    if (patients.length === 0) return null;

    // Tier 1: name + date of birth (strongest signal for dental patients)
    if (dateOfBirth) {
      const dobNorm = this.normalizeDate(dateOfBirth);
      const dobMatch = patients.find(
        (p) =>
          this.namesMatch(p.first_name, p.last_name, firstName, lastName) &&
          this.normalizeDate(p.birth_datetime) === dobNorm,
      );
      if (dobMatch) return dobMatch;
    }

    // Tier 2: name + phone
    if (phone) {
      const phoneNorm = this.normalizePhone(phone);
      const phoneMatch = patients.find(
        (p) =>
          this.namesMatch(p.first_name, p.last_name, firstName, lastName) &&
          p.phones?.some((ph) => this.normalizePhone(ph) === phoneNorm),
      );
      if (phoneMatch) return phoneMatch;
    }

    // Tier 3: name + email (weakest)
    if (email) {
      const emailLower = email.toLowerCase();
      const emailMatch = patients.find(
        (p) =>
          this.namesMatch(p.first_name, p.last_name, firstName, lastName) &&
          p.emails?.some((e) => e.toLowerCase() === emailLower),
      );
      if (emailMatch) return emailMatch;
    }

    if (
      patients.length === 1 &&
      this.namesMatch(
        patients[0].first_name,
        patients[0].last_name,
        firstName,
        lastName,
      )
    ) {
      this.logger.warn(
        `Single name-only match for ${firstName} ${lastName} in Leyr — using it but no secondary verification`,
      );
      return patients[0];
    }

    if (patients.length > 1) {
      this.logger.warn(
        `${patients.length} Leyr patients match name "${firstName} ${lastName}" but none confirmed by DOB/phone/email — skipping auto-match`,
      );
    }

    return null;
  }

  private requiresPersonnummer(emr: string): boolean {
    return this.emrsRequiringPersonnummer.has(emr.toLowerCase());
  }

  private extractPersonnummer(contact: GhlContactRecord): string | null {
    const fields = contact.customFields ?? [];

    if (this.personnummerFieldId) {
      const match = fields.find((f) => f.id === this.personnummerFieldId);
      const value = this.normalizePersonnummer(
        match?.value ?? match?.field_value,
      );
      if (value) return value;
    }

    for (const field of fields) {
      const key = (field.key ?? '').toLowerCase();
      if (key.includes('personnummer') || key.includes('fødselsnummer')) {
        const value = this.normalizePersonnummer(
          field.value ?? field.field_value,
        );
        if (value) return value;
      }
    }

    return null;
  }

  /** Strip non-digits; accept valid 11-digit Norwegian fødselsnummer. */
  private normalizePersonnummer(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const digits = String(value).replace(/\D/g, '');
    return digits.length === 11 ? digits : null;
  }

  private async createLeyrPatientFromGhlContact(
    careUnitId: string,
    emr: string,
    ghlContactId: string,
    firstName: string | null,
    lastName: string | null,
    email: string | null,
    phone: string | null,
    dateOfBirth: string | null,
    personnummer: string | null,
  ): Promise<string> {
    let externalId: string | undefined;

    if (this.requiresPersonnummer(emr)) {
      if (!personnummer) {
        throw new Error(
          `GHL contact ${ghlContactId} has no Personnummer — Opus requires a Norwegian fødselsnummer in custom field (configure SYNC_GHL_PERSONNUMMER_FIELD_ID)`,
        );
      }
      externalId = personnummer;
    } else if (this.supportsPatientSearch(emr)) {
      externalId = ghlContactId;
    }

    const response = await this.leyrService.createPatient(
      careUnitId,
      {
        first_name: firstName,
        last_name: lastName,
        phones: phone ? [phone] : [],
        emails: email ? [email] : [],
        birth_datetime: dateOfBirth,
        ...(externalId ? { external_id: externalId } : {}),
      },
      emr,
    );

    const created = Array.isArray(response) ? response[0] : response;
    const record = created as { id?: string; emr_id?: string } | undefined;
    const patientId = record?.id ?? record?.emr_id;

    if (!patientId) {
      throw new Error(
        `Leyr createPatient returned no id for GHL contact ${ghlContactId}`,
      );
    }

    return String(patientId);
  }

  // ---------------------------------------------------------------------------
  // GHL contact matching & creation
  // ---------------------------------------------------------------------------

  private async findMatchingGhlContact(
    locationId: string,
    firstName: string | null,
    lastName: string | null,
    dateOfBirth: string | null,
    phone: string | null,
  ): Promise<GhlContactRecord | null> {
    if (!firstName || !lastName) return null;

    const result = await this.ghlService.searchContactByName({
      firstName,
      lastName,
      locationId,
    });

    const searchResult = result as {
      found: boolean;
      contact: GhlContactRecord | null;
    };

    if (!searchResult.found || !searchResult.contact) return null;

    const c = searchResult.contact;

    // Verify with a secondary signal when available
    if (dateOfBirth) {
      const dobNorm = this.normalizeDate(dateOfBirth);
      if (c.dateOfBirth && this.normalizeDate(c.dateOfBirth) === dobNorm) {
        return c;
      }
    }

    if (phone) {
      const phoneNorm = this.normalizePhone(phone);
      if (c.phone && this.normalizePhone(c.phone) === phoneNorm) {
        return c;
      }
    }

    // Name matched but no secondary field could be verified.
    // Accept if at least one secondary field is missing on both sides
    // (new patient with minimal data).
    if (!dateOfBirth && !phone) {
      this.logger.warn(
        `GHL contact ${c.id} matched by name only (${firstName} ${lastName}) — no DOB or phone to verify`,
      );
      return c;
    }

    this.logger.warn(
      `GHL contact ${c.id} matched name "${firstName} ${lastName}" but secondary fields differ — treating as no match`,
    );
    return null;
  }

  private async createGhlContactFromLeyrPatient(
    locationId: string,
    firstName: string | null,
    lastName: string | null,
    email: string | null,
    phone: string | null,
    dateOfBirth: string | null,
    patient: LeyrPatientRecord,
  ): Promise<string> {
    const address = patient.addresses?.[0];

    const response = await this.ghlService.createContact({
      locationId,
      firstName: firstName ?? undefined,
      lastName: lastName ?? undefined,
      email: email ?? undefined,
      phone: phone ?? undefined,
      dateOfBirth: dateOfBirth ? this.formatDateForGhl(dateOfBirth) : undefined,
      gender: patient.gender ?? undefined,
      address1: address?.line ?? undefined,
      city: address?.city ?? undefined,
      state: address?.state ?? undefined,
      postalCode: address?.postal_code ?? undefined,
      country: address?.country ?? undefined,
      source: 'leyr-sync',
    });

    const created = (response as { contact?: { id?: string } })?.contact;
    const contactId = created?.id;

    if (!contactId) {
      throw new Error(
        `GHL createContact returned no id for Leyr patient (${firstName} ${lastName})`,
      );
    }

    return String(contactId);
  }

  // ---------------------------------------------------------------------------
  // Normalization helpers
  // ---------------------------------------------------------------------------

  private namesMatch(
    aFirst: string | null | undefined,
    aLast: string | null | undefined,
    bFirst: string | null | undefined,
    bLast: string | null | undefined,
  ): boolean {
    return (
      (aFirst ?? '').toLowerCase().trim() ===
        (bFirst ?? '').toLowerCase().trim() &&
      (aLast ?? '').toLowerCase().trim() === (bLast ?? '').toLowerCase().trim()
    );
  }

  /**
   * Normalize a date string to YYYY-MM-DD for comparison.
   * Handles ISO 8601 datetimes and common date formats.
   */
  private normalizeDate(value: string | null | undefined): string | null {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  /** Strip everything except digits from a phone number for comparison. */
  private normalizePhone(value: string | null | undefined): string | null {
    if (!value) return null;
    const digits = value.replace(/\D/g, '');
    return digits.length >= 7 ? digits : null;
  }

  /**
   * Leyr dates are ISO 8601 datetimes; GHL expects YYYY-MM-DD for dateOfBirth.
   */
  private formatDateForGhl(isoDate: string): string {
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return isoDate;
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
}

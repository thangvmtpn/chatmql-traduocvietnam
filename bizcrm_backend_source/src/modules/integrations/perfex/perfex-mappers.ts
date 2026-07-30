// Pure field mappers: biz-crm Prisma rows → Perfex write payloads.
// No I/O, no DB — unit-testable in isolation.

import { createHash } from 'node:crypto';
import type { Contact, Company } from '@prisma/client';
import type { CustomerPayload, ContactPayload, LeadPayload, PerfexIntegrationConfig } from './perfex-types.js';
import { synthesizeEmail } from './perfex-synthetic-email.js';

/** Split a display name into Perfex firstname/lastname (both required, non-empty). */
export function splitName(fullName?: string | null): { firstname: string; lastname: string } {
  const tokens = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { firstname: 'Unknown', lastname: '.' };
  if (tokens.length === 1) return { firstname: tokens[0], lastname: '.' };
  return { firstname: tokens.slice(0, -1).join(' '), lastname: tokens[tokens.length - 1] };
}

function clean<T extends Record<string, unknown>>(obj: T): T {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v === null || v === undefined || v === '') delete obj[k];
  }
  return obj;
}

/** Resolve the contact's email, synthesizing a non-deliverable one when absent. */
export function resolveContactEmail(contact: Contact, cfg: PerfexIntegrationConfig): string {
  const real = contact.email?.trim();
  if (real) return real;
  return synthesizeEmail(
    { id: contact.id, source: contact.source, phone: contact.phone, zaloUid: contact.zaloUid },
    cfg.syntheticEmailFallbackDomain,
  );
}

export function companyToCustomer(company: Company): CustomerPayload {
  if (!company.name?.trim()) {
    throw new Error('Company.name is empty — cannot sync to Perfex (company is a required field)');
  }
  return clean({
    company: company.name,
    vat: company.taxCode ?? undefined,
    phonenumber: company.phone ?? undefined,
    website: company.website ?? undefined,
    address: company.address ?? undefined,
  }) as CustomerPayload;
}

export function contactToPerfex(
  contact: Contact,
  customerId: number,
  cfg: PerfexIntegrationConfig,
): ContactPayload {
  const { firstname, lastname } = splitName(contact.fullName ?? contact.crmName);
  return clean({
    customer_id: customerId,
    firstname,
    lastname,
    email: resolveContactEmail(contact, cfg),
    title: contact.jobTitle ?? undefined,
    phonenumber: contact.phone ?? undefined,
    is_primary: contact.isPrimaryContact ? 'on' : undefined,
    donotsendwelcomeemail: 'on',
  }) as ContactPayload;
}

export function contactToLead(
  contact: Contact,
  cfg: PerfexIntegrationConfig,
  companyName?: string | null,
): LeadPayload {
  if (cfg.leadSourceId == null || cfg.leadStatusId == null || cfg.leadAssignedId == null) {
    throw new Error('Perfex lead mapping not configured (leadSourceId/leadStatusId/leadAssignedId)');
  }
  return clean({
    name: (contact.fullName ?? contact.crmName ?? 'Lead').trim() || 'Lead',
    source: cfg.leadSourceId,
    status: cfg.leadStatusId,
    assigned: cfg.leadAssignedId,
    email: resolveContactEmail(contact, cfg),
    phonenumber: contact.phone ?? undefined,
    company: companyName ?? undefined,
    description: contact.notes ?? undefined,
  }) as LeadPayload;
}

/** Stable sha1 of a payload (sorted keys) → ExternalSyncRef.lastHash for no-op skip. */
export function payloadHash(payload: Record<string, unknown>): string {
  const sorted = Object.keys(payload)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = payload[k];
      return acc;
    }, {});
  return createHash('sha1').update(JSON.stringify(sorted)).digest('hex');
}

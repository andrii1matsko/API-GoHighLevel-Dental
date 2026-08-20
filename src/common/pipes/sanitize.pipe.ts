import { Injectable, PipeTransform } from '@nestjs/common';

const HTML_TAG_REGEX = /<\/?[^>]+(>|$)/g;
const SCRIPT_CONTENT_REGEX =
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const EVENT_HANDLER_REGEX = /\bon\w+\s*=\s*(['"])[^'"]*\1/gi;
const JAVASCRIPT_PROTO_REGEX = /javascript\s*:/gi;

function stripXss(input: string): string {
  return input
    .replace(SCRIPT_CONTENT_REGEX, '')
    .replace(EVENT_HANDLER_REGEX, '')
    .replace(JAVASCRIPT_PROTO_REGEX, '')
    .replace(HTML_TAG_REGEX, '')
    .trim();
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return stripXss(value);
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value !== null && typeof value === 'object') {
    return sanitizeObject(value as Record<string, unknown>);
  }
  return value;
}

function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    result[key] = sanitizeValue(val);
  }
  return result;
}

@Injectable()
export class SanitizePipe implements PipeTransform {
  transform(value: unknown): unknown {
    return sanitizeValue(value);
  }
}

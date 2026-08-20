const GHL_TO_LEYR: Record<string, string> = {
  new: 'booked',
  confirmed: 'booked',
  active: 'booked',
  showed: 'arrived',
  completed: 'fulfilled',
  cancelled: 'cancelled',
  noshow: 'noshow',
  invalid: 'cancelled',
};

const LEYR_TO_GHL: Record<string, string> = {
  booked: 'confirmed',
  arrived: 'showed',
  fulfilled: 'completed',
  cancelled: 'cancelled',
  noshow: 'noshow',
  awaiting_confirmation: 'new',
  proposed: 'new',
};

export function ghlStatusToLeyr(ghlStatus: string | null | undefined): string {
  if (!ghlStatus) return 'booked';
  return GHL_TO_LEYR[ghlStatus.toLowerCase()] ?? 'booked';
}

export function leyrStatusToGhl(leyrStatus: string | null | undefined): string {
  if (!leyrStatus) return 'confirmed';
  return LEYR_TO_GHL[leyrStatus.toLowerCase()] ?? 'confirmed';
}

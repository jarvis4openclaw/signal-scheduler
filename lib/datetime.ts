// Helper: Convert datetime-local (local time) to ISO string with timezone
// datetime-local returns format: "2026-02-20T15:02" (interpreted as local time)
export function toISOWithTimezone(dateString: string, timezone: string = 'America/Chicago'): string {
  // Parse the datetime-local string as local time
  const [datePart, timePart] = dateString.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);

  // Create date object using local time components
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);

  // Return as ISO string (will be UTC, which is what we want to store)
  return date.toISOString();
}

// Helper: Convert ISO string (UTC) back to datetime-local format
// The datetime-local input expects values in the USER'S local time zone (browser time)
export function fromISOToLocal(isoString: string, timezone: string = 'America/Chicago'): string {
  const date = new Date(isoString);

  // Get LOCAL date and time components (using UTC methods would give wrong time)
  // The datetime-local input always uses the browser's local time
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

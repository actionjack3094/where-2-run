export type VolunteerExportRow = {
  name: string;
  status: string;
  date: string;
  districts: string;
};

function csvCell(value: string) {
  const text = /^[=+\-@]/.test(value) ? `'${value}` : value;
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** Name, Status, Date, Districts. Street addresses stay out of the file. */
export function volunteersToCsv(rows: VolunteerExportRow[]) {
  const lines = [
    ["Name", "Status", "Date", "Districts"],
    ...rows.map((row) => [row.name, row.status, row.date, row.districts]),
  ];
  return lines.map((cells) => cells.map(csvCell).join(",")).join("\r\n");
}

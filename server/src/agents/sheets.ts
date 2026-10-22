/** Read-only access to the user's claude.ai Google Sheets connector. Write tools stay denied. */
export const SHEETS_SERVER = 'claude.ai Google Sheets';

export const SHEETS_READ_TOOLS = ['mcp__claude_ai_Google_Sheets__get_spreadsheet', 'mcp__claude_ai_Google_Sheets__get_values'];

/** Everything an agent needs to reach the spreadsheet through the connector. */
export const sheetsAccess = {
  builtinTools: ['ToolSearch'],
  extraAllowedTools: SHEETS_READ_TOOLS,
  waitForMcpServers: [SHEETS_SERVER],
};

export interface SheetLink {
  url: string;
  spreadsheetId?: string;
  gid?: string;
}

export function parseSheetLink(url: string): SheetLink {
  return {
    url,
    spreadsheetId: url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1],
    gid: url.match(/[#?&]gid=(\d+)/)?.[1],
  };
}

export function describeSheet(sheet: SheetLink): string {
  return [
    `- Link: ${sheet.url}`,
    `- Spreadsheet ID: ${sheet.spreadsheetId ?? 'parse it from the link'}`,
    sheet.gid ? `- Tab gid: ${sheet.gid} (use get_spreadsheet to map it to the tab title)` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

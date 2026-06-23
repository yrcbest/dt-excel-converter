import * as XLSX from 'xlsx';
export function convertToExcel(rows, nsLocText = {}) {
    if (rows.length === 0) {
        throw new Error('没有数据可转换');
    }
    const nsFields = new Set(Object.keys(nsLocText));
    const fieldSet = new Set();
    for (const row of rows) {
        for (const key of Object.keys(row)) {
            if (key !== 'Name')
                fieldSet.add(key);
        }
    }
    const fields = Array.from(fieldSet);
    // Expand NSLOCTEXT fields into 3 columns: source, (package), (key)
    const headers = ['Name'];
    for (const field of fields) {
        headers.push(field);
        if (nsFields.has(field)) {
            headers.push(`${field} (package)`, `${field} (key)`);
        }
    }
    const data = [headers];
    for (const row of rows) {
        const rowData = [row.Name];
        for (const field of fields) {
            rowData.push(row[field] ?? '');
            if (nsFields.has(field)) {
                const meta = nsLocText[field]?.[row.Name];
                rowData.push(meta?.package ?? '');
                rowData.push(meta?.key ?? '');
            }
        }
        data.push(rowData);
    }
    const ws = XLSX.utils.aoa_to_sheet(data);
    // Auto-fit column widths
    ws['!cols'] = headers.map((_, colIdx) => {
        let maxLen = headers[colIdx].length;
        for (let r = 1; r < data.length; r++) {
            const val = String(data[r][colIdx] ?? '');
            maxLen = Math.max(maxLen, val.length);
        }
        return { wch: Math.max(maxLen + 2, 12) };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DataTable');
    return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}

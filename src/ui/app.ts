import { DataTableRow, NSLocTextMeta } from '../types';
import { parseJSON, parseCSV } from '../converter/parse-input';
import { convertToExcel } from '../converter/to-excel';
import { parseExcel } from '../converter/from-excel';
import { formatAsJSON, formatAsCSV } from '../converter/format-output';

function getEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found`);
  return el as T;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function getTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function downloadExcel(rows: DataTableRow[], baseName: string, nsLocText: NSLocTextMeta = {}) {
  const uint8 = convertToExcel(rows, nsLocText);
  const blob = new Blob([uint8 as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  downloadBlob(blob, `${baseName}.xlsx`);
}

function downloadText(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  downloadBlob(blob, filename);
}

function renderPreview(rows: DataTableRow[], container: HTMLElement) {
  container.hidden = false;
  container.innerHTML = '';

  const maxRows = Math.min(rows.length, 20);
  const displayRows = rows.slice(0, maxRows);
  const fields = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key !== 'Name') fields.add(key);
    }
  }
  const fieldList = Array.from(fields);
  const headers = ['Name', ...fieldList];

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const h of headers) {
    const th = document.createElement('th');
    th.textContent = h;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const row of displayRows) {
    const tr = document.createElement('tr');
    const nameTd = document.createElement('td');
    nameTd.textContent = row.Name;
    tr.appendChild(nameTd);
    for (const field of fieldList) {
      const td = document.createElement('td');
      const val = row[field];
      td.textContent = val !== undefined ? String(val) : '';
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  const info = document.createElement('p');
  info.style.cssText = 'font-size:12px;color:var(--c-text-secondary);padding:4px 10px;';
  info.textContent = `共 ${rows.length} 行，显示前 ${Math.min(rows.length, maxRows)} 行`;
  container.appendChild(info);
  container.appendChild(table);
}

function clearPreview(container: HTMLElement) {
  container.hidden = true;
  container.innerHTML = '';
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsText(file);
  });
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsArrayBuffer(file);
  });
}

interface PanelConfig {
  dropZoneId: string;
  inputId: string;
  statusId: string;
  previewId: string;
  accept: string;
  onFile: (file: File) => Promise<void>;
}

function setupDropZone(config: PanelConfig) {
  const dropZone = getEl(config.dropZoneId);
  const fileInput = dropZone.querySelector('input[type="file"]') as HTMLInputElement;

  // Click to upload
  dropZone.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.actions')) return;
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) {
      config.onFile(fileInput.files[0]);
    }
    fileInput.value = '';
  });

  // Drag & drop
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer?.files[0]) {
      config.onFile(e.dataTransfer.files[0]);
    }
  });
}

function validateExtension(filename: string, allowed: string[]): boolean {
  const ext = '.' + filename.split('.').pop()?.toLowerCase();
  return allowed.includes(ext);
}

export function initApp() {
  // ============ UE → Excel Panel ============
  let ueRows: DataTableRow[] | null = null;
  let ueNsLocText: NSLocTextMeta = {};
  let ueBaseName = 'DataTable';
  const previewUE = getEl('preview-ue-input');
  const statusUE = getEl('status-ue-input');
  const btnExcel = getEl('btn-download-excel') as HTMLButtonElement;

  setupDropZone({
    dropZoneId: 'dz-ue-input',
    inputId: 'dz-ue-input',
    statusId: 'status-ue-input',
    previewId: 'preview-ue-input',
    accept: '.json,.csv',
    onFile: async (file) => {
      clearPreview(previewUE);
      statusUE.className = 'status';
      statusUE.textContent = '正在解析...';

      if (!validateExtension(file.name, ['.json', '.csv'])) {
        statusUE.className = 'status error';
        statusUE.textContent = '不支持的文件类型，请上传 .json 或 .csv 文件';
        ueRows = null;
        btnExcel.disabled = true;
        return;
      }

      try {
        const text = await readFileAsText(file);
        const ext = file.name.split('.').pop()?.toLowerCase();
        const result = ext === 'json' ? parseJSON(text) : parseCSV(text);
        ueRows = result.rows;
        ueNsLocText = result.nsLocText;

        if (ueRows.length === 0) {
          throw new Error('文件中没有有效数据');
        }

        ueBaseName = file.name.replace(/\.[^./]+$/, '') || 'DataTable';

        statusUE.className = 'status success';
        statusUE.textContent = `✓ 成功解析 ${ueRows.length} 行数据`;

        renderPreview(ueRows, previewUE);
        btnExcel.disabled = false;
      } catch (err) {
        statusUE.className = 'status error';
        statusUE.textContent = `✗ ${err instanceof Error ? err.message : '解析失败'}`;
        ueRows = null;
        ueNsLocText = {};
        btnExcel.disabled = true;
      }
    },
  });

  btnExcel.addEventListener('click', () => {
    if (ueRows) {
      try {
        downloadExcel(ueRows, ueBaseName, ueNsLocText);
      } catch (err) {
        statusUE.className = 'status error';
        statusUE.textContent = `✗ 导出失败：${err instanceof Error ? err.message : '未知错误'}`;
      }
    }
  });

  // ============ Excel → UE Panel ============
  let excelRows: DataTableRow[] | null = null;
  let excelNsLocText: NSLocTextMeta = {};
  let excelBaseName = 'DataTable';
  const previewExcel = getEl('preview-excel-input');
  const statusExcel = getEl('status-excel-input');
  const btnJSON = getEl('btn-download-json') as HTMLButtonElement;
  const btnCSV = getEl('btn-download-csv') as HTMLButtonElement;

  setupDropZone({
    dropZoneId: 'dz-excel-input',
    inputId: 'dz-excel-input',
    statusId: 'status-excel-input',
    previewId: 'preview-excel-input',
    accept: '.xlsx',
    onFile: async (file) => {
      clearPreview(previewExcel);
      statusExcel.className = 'status';
      statusExcel.textContent = '正在解析...';

      if (!validateExtension(file.name, ['.xlsx'])) {
        statusExcel.className = 'status error';
        statusExcel.textContent = '不支持的文件类型，请上传 .xlsx 文件';
        excelRows = null;
        btnJSON.disabled = true;
        btnCSV.disabled = true;
        return;
      }

      try {
        const buffer = await readFileAsArrayBuffer(file);
        const result = parseExcel(buffer);
        excelRows = result.rows;
        excelNsLocText = result.nsLocText;

        if (excelRows.length === 0) {
          throw new Error('文件中没有有效数据');
        }

        excelBaseName = file.name.replace(/\.[^./]+$/, '') || 'DataTable';

        statusExcel.className = 'status success';
        statusExcel.textContent = `✓ 成功解析 ${excelRows.length} 行数据`;

        renderPreview(excelRows, previewExcel);
        btnJSON.disabled = false;
        btnCSV.disabled = false;
      } catch (err) {
        statusExcel.className = 'status error';
        statusExcel.textContent = `✗ ${err instanceof Error ? err.message : '解析失败'}`;
        excelRows = null;
        excelNsLocText = {};
        btnJSON.disabled = true;
        btnCSV.disabled = true;
      }
    },
  });

  btnJSON.addEventListener('click', () => {
    if (excelRows) {
      try {
        const ts = getTimestamp();
        const content = formatAsJSON(excelRows, excelNsLocText);
        downloadText(content, `${excelBaseName}_${ts}.json`, 'application/json;charset=utf-8');
      } catch (err) {
        statusExcel.className = 'status error';
        statusExcel.textContent = `✗ 导出失败：${err instanceof Error ? err.message : '未知错误'}`;
      }
    }
  });

  btnCSV.addEventListener('click', () => {
    if (excelRows) {
      try {
        const ts = getTimestamp();
        const content = formatAsCSV(excelRows, excelNsLocText);
        downloadText(content, `${excelBaseName}_${ts}.csv`, 'text/csv;charset=utf-8');
      } catch (err) {
        statusExcel.className = 'status error';
        statusExcel.textContent = `✗ 导出失败：${err instanceof Error ? err.message : '未知错误'}`;
      }
    }
  });
}

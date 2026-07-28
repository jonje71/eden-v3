import * as XLSX from 'xlsx';

export function parseSf1File(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        // Simple SF1 row extraction heuristic
        const parsedStudents = [];
        for (let i = 0; i < jsonRows.length; i++) {
          const row = jsonRows[i];
          if (!row || row.length < 3) continue;

          // Search for rows with LRN or Student Name structures
          const strRow = row.join(' ');
          if (strRow.toLowerCase().includes('school name') || strRow.toLowerCase().includes('masterlist')) {
            continue;
          }

          // Heuristic extraction
          const possibleLrn = row.find(cell => typeof cell === 'number' && String(cell).length === 12);
          const possibleName = row.find(cell => typeof cell === 'string' && cell.includes(','));
          const possibleSex = row.find(cell => typeof cell === 'string' && (cell.toUpperCase() === 'M' || cell.toUpperCase() === 'F'));

          if (possibleName) {
            const parts = possibleName.split(',');
            const lastName = parts[0]?.trim();
            const firstName = parts[1]?.trim();
            if (lastName && firstName) {
              parsedStudents.push({
                lastName,
                firstName,
                sex: possibleSex ? possibleSex.toUpperCase() : 'M',
                lrn: possibleLrn ? String(possibleLrn) : '',
                isEnriched: true
              });
            }
          }
        }
        resolve(parsedStudents);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
}

export interface AnalysisRecord {
  id: number;
  country: string;
  analysis_time: string;
  analysis_resolution?: number;
  total_population?: number;
  population_15min_percent: number;
  population_30min_percent: number;
  population_60min_percent: number;
}

// Date formatting function from projects-view.tsx (line 62-64)
export const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleString();
};

// CSV export function from projects-view.tsx (line 66-94)
const escapeCsv = (v: unknown) => String(v).replace(/"/g, '""');

export const exportToCSV = (records: AnalysisRecord[]) => {
  const headers = ['ID', 'Country', 'Analysis Time', 'Resolution (m)', 'Total Population', '15min Coverage (%)', '30min Coverage (%)', '60min Coverage (%)'];
  
  const csvData = records.map(record => [
    record.id,
    record.country,
    formatDate(record.analysis_time),
    record.analysis_resolution || 'N/A',
    record.total_population || 'N/A',
    record.population_15min_percent,
    record.population_30min_percent,
    record.population_60min_percent
  ]);

  const csvContent = [
    headers.join(','),
    ...csvData.map(row => row.map(cell => `"${escapeCsv(cell)}"`).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `analysis_records_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
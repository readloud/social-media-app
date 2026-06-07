export const AnomalyAlert: React.FC<{ anomaly: any }> = ({ anomaly }) => {
  const severityColors = {
    CRITICAL: 'bg-red-100 border-red-500 text-red-700',
    HIGH: 'bg-orange-100 border-orange-500 text-orange-700',
    MEDIUM: 'bg-yellow-100 border-yellow-500 text-yellow-700',
    LOW: 'bg-blue-100 border-blue-500 text-blue-700',
  };

  return (
    <div className={`border-l-4 p-4 mb-4 rounded ${severityColors[anomaly.severity]}`}>
      <div className="flex items-center justify-between">
        <h3 className="font-bold">{anomaly.type}</h3>
        <span className="text-sm">{new Date(anomaly.timestamp).toLocaleString()}</span>
      </div>
      <p className="mt-1">{anomaly.description}</p>
      <div className="mt-2 flex items-center space-x-4">
        <span className="text-sm">Risk Score: {(anomaly.score * 100).toFixed(1)}%</span>
        <button className="text-sm underline">Investigate</button>
      </div>
    </div>
  );
};
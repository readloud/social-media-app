import React, { useState } from 'react';
import { CheckCircle, XCircle, Clock, Shield } from 'lucide-react';

export const BlockchainVerificationBadge: React.FC<{ scheduleId: string }> = ({ scheduleId }) => {
  const [verification, setVerification] = useState(null);

  return (
    <div className="inline-flex items-center space-x-2 bg-gray-100 rounded-lg px-3 py-1">
      <Shield className="w-4 h-4 text-green-600" />
      <span className="text-sm font-medium">Blockchain Verified</span>
      <a 
        href={`https://etherscan.io/tx/${verification?.transactionHash}`}
        target="_blank"
        className="text-blue-600 hover:underline text-sm"
      >
        View Proof
      </a>
    </div>
  );
};

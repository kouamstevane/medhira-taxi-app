"use client";

import { IconType } from 'react-icons';

interface StatsCardProps {
  label: string;
  value: string | number;
  icon: IconType;
  color: string;
  iconColor: string;
}

export function StatsCard({ label, value, icon: IconComponent, color, iconColor }: StatsCardProps) {
  return (
    <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-lg">
      <div className="flex items-center">
        <div className={`${color} p-2 sm:p-3 rounded-lg flex-shrink-0`}>
          <IconComponent className={`h-5 w-5 sm:h-6 sm:w-6 ${iconColor}`} />
        </div>
        <div className="ml-3 sm:ml-4 min-w-0 flex-1">
          <p className="text-xs sm:text-sm text-gray-600">{label}</p>
          <p className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 truncate">{value}</p>
        </div>
      </div>
    </div>
  );
}


"use client";

import React from 'react';

export const DriverSkeleton = () => {
  return (
    <div className="animate-pulse">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50/50 backdrop-blur-sm">
            <tr>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <th key={i} className="px-6 py-3 text-left">
                  <div className="h-4 bg-gray-200 rounded w-20"></div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white/30 divide-y divide-gray-200">
            {[1, 2, 3, 4, 5].map((row) => (
              <tr key={row}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-32"></div>
                    <div className="h-3 bg-gray-100 rounded w-24"></div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-40"></div>
                    <div className="h-3 bg-gray-100 rounded w-32"></div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-28"></div>
                    <div className="h-3 bg-gray-100 rounded w-20"></div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="h-6 bg-gray-200 rounded-full w-20"></div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="h-4 bg-gray-200 rounded w-24"></div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <div className="flex justify-end gap-2">
                    <div className="h-8 bg-gray-200 rounded w-20"></div>
                    <div className="h-8 bg-gray-200 rounded w-16"></div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const DriverDetailsSkeleton = () => {
  return (
    <div className="animate-pulse space-y-8 p-6">
      <div className="flex justify-between items-center mb-8">
        <div className="h-8 bg-gray-200 rounded w-1/2"></div>
        <div className="h-6 bg-gray-100 rounded w-6"></div>
      </div>

      <div className="space-y-6">
        <div>
          <div className="h-6 bg-gray-200 rounded w-40 mb-4"></div>
          <div className="grid grid-cols-2 gap-6">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i}>
                <div className="h-3 bg-gray-100 rounded w-20 mb-2"></div>
                <div className="h-5 bg-gray-200 rounded w-full"></div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="h-6 bg-gray-200 rounded w-40 mb-4"></div>
          <div className="grid grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i}>
                <div className="h-3 bg-gray-100 rounded w-20 mb-2"></div>
                <div className="h-5 bg-gray-200 rounded w-full"></div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="h-6 bg-gray-200 rounded w-32 mb-4"></div>
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 bg-gray-100 rounded w-24"></div>
                <div className="h-48 bg-gray-200 rounded-xl w-full"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

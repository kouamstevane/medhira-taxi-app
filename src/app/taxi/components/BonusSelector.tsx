/**
 * Composant BonusSelector
 * 
 * Permet au client de sélectionner un bonus pour motiver les chauffeurs
 * et élargir la zone de recherche.
 */

import React from 'react';

interface BonusSelectorProps {
    selectedBonus: number;
    onSelect: (amount: number) => void;
    disabled?: boolean;
}

const BONUS_AMOUNTS = [500, 1000, 1500, 2000];

export const BonusSelector: React.FC<BonusSelectorProps> = ({
    selectedBonus,
    onSelect,
    disabled = false,
}) => {
    return (
        <div className="w-full space-y-3 animate-fadeIn">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">
                    Motiver un chauffeur (Bonus)
                </h3>
                {selectedBonus > 0 && (
                    <button
                        onClick={() => onSelect(0)}
                        className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded active:bg-red-50"
                        disabled={disabled}
                    >
                        Retirer
                    </button>
                )}
            </div>

            <p className="text-xs text-gray-500">
                Ajoutez un bonus pour élargir la zone de recherche à 10 min et motiver les chauffeurs éloignés.
            </p>

            <div className="grid grid-cols-4 gap-2 sm:gap-3">
                {BONUS_AMOUNTS.map((amount) => (
                    <button
                        key={amount}
                        onClick={() => onSelect(amount === selectedBonus ? 0 : amount)}
                        disabled={disabled}
                        className={`
              relative py-3 px-1 rounded-xl text-sm font-bold transition-all duration-200 touch-manipulation
              active:scale-95 transform
              ${selectedBonus === amount
                                ? 'bg-[#f29200] text-white shadow-lg ring-2 ring-[#f29200] ring-offset-2'
                                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'
                            }
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
                    >
                        {selectedBonus === amount && (
                            <span className="absolute -top-2 -right-2 bg-green-500 text-white text-[10px] px-1.5 py-0.5 rounded-full shadow-sm">
                                ✓
                            </span>
                        )}
                        +{amount}
                    </button>
                ))}
            </div>

            {selectedBonus > 0 && (
                <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 flex items-start gap-2">
                    <span className="text-orange-500 mt-0.5">⚡</span>
                    <p className="text-xs text-orange-700">
                        <strong>Zone élargie !</strong> Votre demande est maintenant visible par les chauffeurs jusqu&apos;à 10 minutes de distance.
                    </p>
                </div>
            )}
        </div>
    );
};

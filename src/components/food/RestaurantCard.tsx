import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { Restaurant } from '@/types/food-delivery';
import { CURRENCY_CODE } from '@/utils/constants';

interface RestaurantCardProps {
  restaurant: Restaurant;
}

export const RestaurantCard: React.FC<RestaurantCardProps> = ({ restaurant }) => {
  return (
    <Link href={`/food/restaurant/${restaurant.id}`} className="block">
      <div className="glass-card rounded-2xl border border-white/5 overflow-hidden hover:border-white/10 transition-all duration-300 hover:scale-[1.01]">
        <div className="relative h-48 w-full bg-white/10">
          {restaurant.imageUrl ? (
            <Image
              src={restaurant.imageUrl}
              alt={restaurant.name}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-white/5 text-slate-500">
              <MaterialIcon name="restaurant" size="xl" />
            </div>
          )}

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

          {/* Badge fermé */}
          {!restaurant.isOpen && (
            <div className="absolute top-3 left-3 bg-destructive text-white text-xs font-bold px-2 py-1 rounded-full">
              Fermé
            </div>
          )}

          {/* Badge Prix */}
          <div className="absolute top-3 right-3 bg-black/50 backdrop-blur text-white text-xs font-semibold px-2 py-1 rounded-full border border-white/10">
            {restaurant.avgPricePerPerson} {CURRENCY_CODE} / pers.
          </div>
        </div>

        <div className="p-4">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-lg font-bold text-white truncate pr-2">{restaurant.name}</h3>
            {restaurant.rating > 0 && (
              <div className="flex items-center gap-1 bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded text-sm font-medium shrink-0">
                <MaterialIcon name="star" size="sm" filled />
                <span>{restaurant.rating.toFixed(1)}</span>
                <span className="text-xs text-green-400/70">({restaurant.totalReviews})</span>
              </div>
            )}
          </div>

          <p className="text-slate-400 text-sm mb-3">
            {Array.isArray(restaurant.cuisineType) ? restaurant.cuisineType.join(', ') : restaurant.cuisineType}
          </p>

          <div className="flex items-center gap-4 text-xs text-slate-500">
            <div className="flex items-center gap-1">
              <MaterialIcon name="schedule" size="sm" className="text-primary" />
              <span>15-25 min</span>
            </div>
            {restaurant.address && (
              <div className="flex items-center gap-1 truncate">
                <MaterialIcon name="location_on" size="sm" className="text-primary shrink-0" />
                <span className="truncate">{restaurant.address}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
};

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Star, Clock, MapPin } from 'lucide-react';
import { Restaurant } from '@/types/food-delivery';

interface RestaurantCardProps {
  restaurant: Restaurant;
}

export const RestaurantCard: React.FC<RestaurantCardProps> = ({ restaurant }) => {
  return (
    <Link href={`/food/restaurant/${restaurant.id}`} className="block">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-300">
        <div className="relative h-48 w-full bg-gray-200">
          {restaurant.imageUrl ? (
            <Image
              src={restaurant.imageUrl}
              alt={restaurant.name}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400">
              Aucune image
            </div>
          )}
          
          {/* Badge de statut si fermé */}
          {!restaurant.isOpen && (
            <div className="absolute top-3 left-3 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
              Fermé
            </div>
          )}

          {/* Badge Prix */}
          <div className="absolute top-3 right-3 bg-white/90 backdrop-blur text-gray-800 text-xs font-semibold px-2 py-1 rounded-full shadow-sm">
            {restaurant.avgPricePerPerson} € / pers.
          </div>
        </div>
        
        <div className="p-4">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-lg font-bold text-gray-900 truncate pr-2">{restaurant.name}</h3>
            {restaurant.rating > 0 && (
              <div className="flex items-center gap-1 bg-green-50 text-green-700 px-1.5 py-0.5 rounded text-sm font-medium">
                <Star className="w-3.5 h-3.5 fill-current" />
                <span>{restaurant.rating.toFixed(1)}</span>
                <span className="text-xs text-green-600/70">({restaurant.totalReviews})</span>
              </div>
            )}
          </div>
          
          <p className="text-gray-500 text-sm mb-3">
            {Array.isArray(restaurant.cuisineType) ? restaurant.cuisineType.join(', ') : restaurant.cuisineType}
          </p>
          
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>15-25 min</span>
            </div>
            {restaurant.address && (
              <div className="flex items-center gap-1 truncate">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{restaurant.address}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
};

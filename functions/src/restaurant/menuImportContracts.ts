import { z } from 'zod';
import type * as admin from 'firebase-admin';

export type MenuItemSource = 'csv' | 'excel' | 'woocommerce' | 'manual';
export type MenuImportType = 'csv' | 'excel' | 'woocommerce';
export type MenuImportFileFormat = 'csv' | 'zip' | 'xlsx';
export type MenuImportStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface MenuImportError {
  row?: number;
  item?: string;
  message: string;
}

export interface MenuImportJobRecord {
  id: string;
  restaurantId: string;
  type: MenuImportType;
  fileFormat?: MenuImportFileFormat;
  status: MenuImportStatus;
  filePath?: string;
  integrationId?: string;
  totalItems: number;
  processedItems: number;
  failedItems: number;
  errors: MenuImportError[];
  includedRowNumbers?: number[];
  attemptCount?: number;
  leaseExpiresAt?: admin.firestore.Timestamp;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
  completedAt?: admin.firestore.Timestamp;
}

export interface ParsedMenuRow {
  rowNumber: number;
  name: string;
  description: string;
  price: number;
  category: string;
  externalId: string;
  isAvailable: boolean;
  image?: string;
  sourceUpdatedAt?: Date;
}

export type MenuImportPreviewStatus = 'new' | 'update' | 'invalid' | 'conflict';

export interface MenuImportPreviewRow {
  rowNumber: number;
  name: string;
  description: string;
  price: number;
  category: string;
  externalId: string;
  hasImage: boolean;
  status: MenuImportPreviewStatus;
  selectable: boolean;
  error?: string;
}

export interface MenuImportPreviewSummary {
  totalRows: number;
  importableRows: number;
  invalidRows: number;
  conflictRows: number;
  newRows: number;
  updateRows: number;
}

export interface MenuImportPreview {
  importId: string;
  rows: MenuImportPreviewRow[];
  summary: MenuImportPreviewSummary;
}

export interface ExistingImportedMenuItem {
  source?: string;
  externalId?: string;
}

export interface SyncSummary {
  totalItems: number;
  processedItems: number;
  failedItems: number;
  deactivatedItems: number;
}

export const MenuRowZodSchema = z.object({
  name: z.string().trim().min(2, 'Le nom doit contenir au moins 2 caractères').max(120, 'Le nom ne peut pas dépasser 120 caractères'),
  description: z.string().trim().max(1000, 'La description ne peut pas dépasser 1000 caractères').default(''),
  price: z.number().positive('Le prix doit être strictement positif').max(50_000_000, 'Le prix dépasse la limite maximale'),
  category: z.string().trim().min(1, 'La catégorie est requise').max(80, 'La catégorie ne peut pas dépasser 80 caractères'),
  externalId: z.string().trim().min(1, 'externalId est requis').max(256, 'externalId ne peut pas dépasser 256 caractères'),
  isAvailable: z.boolean().default(true),
  image: z.string().trim().max(512, "Le nom de l'image ne peut pas dépasser 512 caractères").optional(),
});

const MenuFileImportFormatFields = {
  restaurantId: z.string().trim().min(1, 'restaurantId requis'),
  importId: z.string().trim().min(1, 'importId requis'),
  filePath: z.string().trim().min(1, 'filePath requis'),
  type: z.enum(['csv', 'excel']),
  fileFormat: z.enum(['csv', 'zip', 'xlsx']),
};

const MenuFileImportFormatSchema = z.object(MenuFileImportFormatFields).refine(
  (data) => (data.type === 'excel') === (data.fileFormat === 'xlsx'),
  'Le type et le format du fichier ne correspondent pas'
);

export const StartMenuFileImportSchema = MenuFileImportFormatSchema.extend({
  reviewConfirmed: z.literal(true),
  includedRowNumbers: z.array(z.number().int().min(2)).min(1).max(10000),
});

export const PreviewMenuFileImportSchema = MenuFileImportFormatSchema;

export const TestStoreConnectionSchema = z.object({
  restaurantId: z.string().trim().min(1, 'restaurantId requis'),
  siteUrl: z.string().trim().url('URL invalide'),
  consumerKey: z.string().trim().min(1, 'Consumer Key requise'),
  consumerSecret: z.string().trim().min(1, 'Consumer Secret requis'),
});

export const SaveStoreIntegrationSchema = z.object({
  restaurantId: z.string().trim().min(1, 'restaurantId requis'),
  siteUrl: z.string().trim().url('URL invalide'),
  consumerKey: z.string().trim().min(1, 'Consumer Key requise'),
  consumerSecret: z.string().trim().min(1, 'Consumer Secret requis'),
});

export const StartRestaurantStoreSyncSchema = z.object({
  restaurantId: z.string().trim().min(1, 'restaurantId requis'),
  integrationId: z.literal('woocommerce').default('woocommerce'),
});

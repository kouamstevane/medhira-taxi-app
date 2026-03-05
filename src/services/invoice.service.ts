/**
 * Service de Génération de Factures
 *
 * Gère la création et le téléchargement de factures PDF pour les courses
 *
 * @module services/invoice
 */

import jsPDF from "jspdf";
import { Booking } from "@/types/booking";
import { Timestamp } from "firebase/firestore";

/**
 * Interface pour les données de facture
 */
export interface InvoiceData {
  bookingId: string;
  clientEmail?: string;
  pickup: string;
  destination: string;
  distance: number;
  duration: number;
  carType: string;
  basePrice: number;
  distancePrice: number;
  durationPrice: number;
  finalPrice: number;
  driverName?: string;
  carModel?: string;
  carPlate?: string;
  createdAt: Date;
  completedAt?: Date;
}

/**
 * Convertir un Timestamp Firebase en Date
 */
const toDate = (value: Date | Timestamp | undefined): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === "object" && "toDate" in value) {
    return value.toDate();
  }
  return new Date();
};

/**
 * Formater une date en français (Canada)
 */
const formatDate = (date: Date | undefined): string => {
  if (!date) return "N/A";
  return date.toLocaleDateString("fr-CA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/**
 * Générer un numéro de facture unique
 */
const generateInvoiceNumber = (bookingId: string, date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const shortId = bookingId.slice(-6).toUpperCase();
  return `FAC-${year}${month}-${shortId}`;
};

/**
 * Extraire les données de facture depuis un booking
 */
export const extractInvoiceData = (booking: Booking): InvoiceData => {
  const createdAt = toDate(booking.createdAt) || new Date();
  const completedAt = toDate(booking.completedAt);

  // Estimation des prix par composante pour le Canada
  const estimatedBasePrice = 3.50;
  const estimatedPricePerKm = 1.75;
  const estimatedPricePerMin = 0.45;

  const distancePrice = Math.round(booking.distance * estimatedPricePerKm * 100) / 100;
  const durationPrice = Math.round(
    (booking.actualDuration || booking.duration) * estimatedPricePerMin * 100) / 100;
  const basePrice = estimatedBasePrice;

  return {
    bookingId: booking.id,
    clientEmail: booking.userEmail || undefined,
    pickup: booking.pickup,
    destination: booking.destination,
    distance: booking.distance,
    duration: booking.actualDuration || booking.duration,
    carType: booking.carType,
    basePrice,
    distancePrice,
    durationPrice,
    finalPrice: booking.finalPrice || booking.price,
    driverName: booking.driverName,
    carModel: booking.carModel,
    carPlate: booking.carPlate,
    createdAt,
    completedAt,
  };
};

/**
 * Générer et télécharger une facture PDF
 */
export const generateInvoicePDF = (data: InvoiceData): void => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Couleurs
  const primaryColor: [number, number, number] = [242, 146, 0]; // #f29200
  const darkColor: [number, number, number] = [16, 16, 16]; // #101010
  const grayColor: [number, number, number] = [128, 128, 128];

  let y = 20;

  // === EN-TÊTE ===
  // Logo/Nom de l'entreprise
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, pageWidth, 40, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  doc.text("MEDHIRA TAXI", pageWidth / 2, 22, { align: "center" });

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text("Votre trajet en toute confiance", pageWidth / 2, 32, {
    align: "center",
  });

  y = 55;

  // === NUMÉRO DE FACTURE ===
  const invoiceNumber = generateInvoiceNumber(data.bookingId, data.createdAt);

  doc.setTextColor(...darkColor);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("FACTURE", 20, y);

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...grayColor);
  doc.text(`N° ${invoiceNumber}`, pageWidth - 20, y, { align: "right" });

  y += 15;

  // === DATES ===
  doc.setFontSize(10);
  doc.setTextColor(...grayColor);
  doc.text(`Date de la course: ${formatDate(data.createdAt)}`, 20, y);
  if (data.completedAt) {
    doc.text(
      `Terminée le: ${formatDate(data.completedAt)}`,
      pageWidth - 20,
      y,
      { align: "right" }
    );
  }

  y += 20;

  // === INFORMATIONS CLIENT ===
  doc.setFillColor(245, 245, 245);
  doc.rect(15, y - 5, pageWidth - 30, 25, "F");

  doc.setTextColor(...darkColor);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Client", 20, y + 5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(data.clientEmail || "Client", 20, y + 15);

  y += 35;

  // === DÉTAILS DU TRAJET ===
  doc.setTextColor(...darkColor);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Détails du trajet", 20, y);

  y += 10;

  // Point de départ
  doc.setFillColor(76, 175, 80); // Vert
  doc.circle(25, y + 2, 3, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...grayColor);
  doc.text("Départ:", 32, y);
  doc.setTextColor(...darkColor);

  // Tronquer le texte si trop long
  const maxTextWidth = 140;
  let pickupText = data.pickup;
  if (doc.getTextWidth(pickupText) > maxTextWidth) {
    pickupText = pickupText.substring(0, 60) + "...";
  }
  doc.text(pickupText, 32, y + 6);

  y += 15;

  // Destination
  doc.setFillColor(244, 67, 54); // Rouge
  doc.circle(25, y + 2, 3, "F");
  doc.setTextColor(...grayColor);
  doc.text("Destination:", 32, y);
  doc.setTextColor(...darkColor);

  let destText = data.destination;
  if (doc.getTextWidth(destText) > maxTextWidth) {
    destText = destText.substring(0, 60) + "...";
  }
  doc.text(destText, 32, y + 6);

  y += 20;

  // === INFORMATIONS VÉHICULE ===
  if (data.driverName || data.carModel) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Véhicule", 20, y);

    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    if (data.driverName) {
      doc.text(`Chauffeur: ${data.driverName}`, 20, y);
      y += 6;
    }
    if (data.carModel) {
      doc.text(`Véhicule: ${data.carModel}`, 20, y);
      y += 6;
    }
    if (data.carPlate) {
      doc.text(`Immatriculation: ${data.carPlate}`, 20, y);
      y += 6;
    }
    doc.text(`Type: ${data.carType}`, 20, y);

    y += 15;
  }

  // === DÉTAIL DE LA FACTURATION ===
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...darkColor);
  doc.text("Détail de la facturation", 20, y);

  y += 10;

  // Tableau des coûts
  const tableStartY = y;
  const col1 = 20;
  const col2 = pageWidth - 50;

  // En-tête du tableau
  doc.setFillColor(...primaryColor);
  doc.rect(15, y - 5, pageWidth - 30, 10, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Description", col1, y + 2);
  doc.text("Montant", col2, y + 2, { align: "right" });

  y += 12;

  // Lignes du tableau
  doc.setTextColor(...darkColor);
  doc.setFont("helvetica", "normal");

  const rows = [
    {
      label: "Tarif de base",
      value: `${data.basePrice.toLocaleString("fr-CA", { minimumFractionDigits: 2 })} CAD`,
    },
    {
      label: `Distance (${data.distance.toFixed(2)} km)`,
      value: `${data.distancePrice.toLocaleString("fr-CA", { minimumFractionDigits: 2 })} CAD`,
    },
    {
      label: `Durée (${data.duration} min)`,
      value: `${data.durationPrice.toLocaleString("fr-CA", { minimumFractionDigits: 2 })} CAD`,
    },
  ];

  rows.forEach((row, index) => {
    if (index % 2 === 0) {
      doc.setFillColor(250, 250, 250);
      doc.rect(15, y - 4, pageWidth - 30, 10, "F");
    }
    doc.text(row.label, col1, y + 2);
    doc.text(row.value, col2, y + 2, { align: "right" });
    y += 10;
  });

  // Total
  y += 5;
  doc.setFillColor(...primaryColor);
  doc.rect(15, y - 5, pageWidth - 30, 14, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL", col1, y + 4);
  doc.text(`${data.finalPrice.toLocaleString("fr-CA", { minimumFractionDigits: 2 })} CAD`, col2, y + 4, {
    align: "right",
  });

  y += 25;

  // === PIED DE PAGE ===
  doc.setFontSize(9);
  doc.setTextColor(...grayColor);
  doc.setFont("helvetica", "italic");
  doc.text("Merci pour votre confiance !", pageWidth / 2, y, {
    align: "center",
  });

  y += 8;
  doc.setFont("helvetica", "normal");
  doc.text(
    "Cette facture a été générée automatiquement par Medjira.",
    pageWidth / 2,
    y,
    { align: "center" }
  );

  // Ligne de séparation en bas
  doc.setDrawColor(...primaryColor);
  doc.setLineWidth(0.5);
  doc.line(20, 280, pageWidth - 20, 280);

  doc.setFontSize(8);
  doc.text("© Medjira - Tous droits réservés", pageWidth / 2, 287, {
    align: "center",
  });

  // Télécharger le PDF
  const filename = `Facture_${invoiceNumber}.pdf`;
  doc.save(filename);
};

/**
 * Générer et télécharger une facture à partir d'un booking
 */
export const downloadInvoiceFromBooking = (booking: Booking): void => {
  const invoiceData = extractInvoiceData(booking);
  generateInvoicePDF(invoiceData);
};

/**
 * Obtenir le texte formaté de la facture (pour le chat)
 */
export const getInvoiceText = (booking: Booking): string => {
  const data = extractInvoiceData(booking);
  const invoiceNumber = generateInvoiceNumber(data.bookingId, data.createdAt);

  return `🏁 Course terminée !

📋 Facture N° ${invoiceNumber}
━━━━━━━━━━━━━━━━━━━━━

📍 De: ${data.pickup}
📍 Vers: ${data.destination}

📊 Détails:
• Tarif de base: ${data.basePrice.toLocaleString("fr-CA", { minimumFractionDigits: 2 })} CAD
• Distance (${data.distance.toFixed(2)} km): ${data.distancePrice.toLocaleString("fr-CA", { minimumFractionDigits: 2 })} CAD
• Durée (${data.duration} min): ${data.durationPrice.toLocaleString("fr-CA", { minimumFractionDigits: 2 })} CAD

━━━━━━━━━━━━━━━━━━━━━
💰 TOTAL: ${data.finalPrice.toLocaleString("fr-CA", { minimumFractionDigits: 2 })} CAD

Merci pour votre confiance ! 🙏`;
};

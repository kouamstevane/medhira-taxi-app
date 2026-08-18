import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BulkCsvImportModal } from '../BulkCsvImportModal';
import * as MenuImportClientService from '@/services/menu-import-client.service';

jest.mock('@/services/menu-import-client.service');

describe('BulkCsvImportModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    restaurantId: 'resto-123',
    onImportCompleted: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders modal when isOpen is true', () => {
    render(<BulkCsvImportModal {...defaultProps} />);
    expect(screen.getByText('Importer un catalogue de plats')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Besoin d’un modèle ?' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Modèle CSV/i })).toHaveAttribute(
      'href',
      '/templates/menu-import/menu-template.csv'
    );
    expect(screen.getByRole('link', { name: /Modèle ZIP/i })).toHaveAttribute(
      'href',
      '/templates/menu-import/menu-template.zip'
    );
    expect(screen.getByRole('link', { name: /Modèle Excel/i })).toHaveAttribute(
      'href',
      '/templates/menu-import/menu-template.xlsx'
    );
    expect(screen.getByText(/Obligatoires :/i)).toBeInTheDocument();
    expect(screen.queryByText(/preparationTime/i)).not.toBeInTheDocument();
  });

  test('does not render when isOpen is false', () => {
    const { container } = render(<BulkCsvImportModal {...defaultProps} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  test('locks background scrolling while the modal is open', () => {
    render(<BulkCsvImportModal {...defaultProps} />);

    expect(document.body.style.overflow).toBe('hidden');
  });

  test('does not trigger a service call when a template link is rendered', () => {
    render(<BulkCsvImportModal {...defaultProps} />);
    expect(MenuImportClientService.downloadSampleCsvTemplate).not.toHaveBeenCalled();
  });

  test('shows a review before starting the import job', async () => {
    (MenuImportClientService.uploadMenuImportFile as jest.Mock).mockResolvedValueOnce({
      importId: 'imp-456',
      filePath: 'menu-imports/resto-123/imp-456.csv',
      type: 'csv',
      fileFormat: 'csv',
    });
    (MenuImportClientService.previewMenuFileImport as jest.Mock).mockResolvedValueOnce({
      importId: 'imp-456',
      rows: [
        {
          rowNumber: 2,
          name: 'Pizza',
          description: 'Maison',
          price: 12,
          category: 'Plats',
          externalId: 'pizza-1',
          hasImage: false,
          status: 'new',
          selectable: true,
        },
      ],
      summary: { totalRows: 1, importableRows: 1, invalidRows: 0, conflictRows: 0, newRows: 1, updateRows: 0 },
    });
    (MenuImportClientService.startMenuFileImport as jest.Mock).mockResolvedValueOnce({ importId: 'imp-456' });
    (MenuImportClientService.listenToImportProgress as jest.Mock).mockImplementation(
      (restaurantId, importId, onJob) => {
        onJob({
          id: importId,
          restaurantId,
          type: 'csv',
          status: 'completed',
          totalItems: 10,
          processedItems: 10,
          failedItems: 0,
          errors: [],
        });
        return jest.fn();
      }
    );

    render(<BulkCsvImportModal {...defaultProps} />);

    const file = new File(['name,price\nPizza,12'], 'menu.csv', { type: 'text/csv' });
    const input = screen.getByTestId('file-input');
    fireEvent.change(input, { target: { files: [file] } });

    fireEvent.click(screen.getByText(/Analyser le fichier/i));

    await waitFor(() => {
      expect(MenuImportClientService.uploadMenuImportFile).toHaveBeenCalledWith(
        'resto-123',
        expect.any(File),
        expect.any(Function),
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
      expect(MenuImportClientService.previewMenuFileImport).toHaveBeenCalledWith({
        restaurantId: 'resto-123',
        importId: 'imp-456',
        filePath: 'menu-imports/resto-123/imp-456.csv',
        type: 'csv',
        fileFormat: 'csv',
      });
      expect(screen.getByText('Récapitulatif de l’importation')).toBeInTheDocument();
      expect(screen.getByText('Pizza')).toBeInTheDocument();
      expect(MenuImportClientService.startMenuFileImport).not.toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText(/Confirmer et importer/i));

    await waitFor(() => {
      expect(MenuImportClientService.startMenuFileImport).toHaveBeenCalledWith({
        restaurantId: 'resto-123',
        importId: 'imp-456',
        filePath: 'menu-imports/resto-123/imp-456.csv',
        type: 'csv',
        fileFormat: 'csv',
        reviewConfirmed: true,
        includedRowNumbers: [2],
      });
      expect(defaultProps.onImportCompleted).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed', failedItems: 0 })
      );
    });
  });

  test('reports completed imports with row errors without treating them as fully successful', async () => {
    (MenuImportClientService.uploadMenuImportFile as jest.Mock).mockResolvedValueOnce({
      importId: 'imp-789',
      filePath: 'menu-imports/resto-123/imp-789.csv',
      type: 'csv',
      fileFormat: 'csv',
    });
    (MenuImportClientService.previewMenuFileImport as jest.Mock).mockResolvedValueOnce({
      importId: 'imp-789',
      rows: [
        {
          rowNumber: 2,
          name: 'Pizza invalide',
          description: '',
          price: 0,
          category: 'Tests',
          externalId: 'bad-1',
          hasImage: false,
          status: 'invalid',
          selectable: false,
          error: 'Prix invalide',
        },
      ],
      summary: { totalRows: 1, importableRows: 0, invalidRows: 1, conflictRows: 0, newRows: 0, updateRows: 0 },
    });
    (MenuImportClientService.startMenuFileImport as jest.Mock).mockResolvedValueOnce({ importId: 'imp-789' });
    const job = {
      id: 'imp-789',
      restaurantId: 'resto-123',
      type: 'csv' as const,
      status: 'completed' as const,
      totalItems: 3,
      processedItems: 2,
      failedItems: 1,
      errors: [{ row: 3, message: 'Le prix doit être positif' }],
    };
    (MenuImportClientService.listenToImportProgress as jest.Mock).mockImplementation(
      (restaurantId, importId, onJob) => {
        onJob({ ...job, restaurantId, id: importId });
        return jest.fn();
      }
    );

    render(<BulkCsvImportModal {...defaultProps} />);
    fireEvent.change(screen.getByTestId('file-input'), {
      target: { files: [new File(['name,price\nPizza,-1'], 'menu.csv', { type: 'text/csv' })] },
    });
    fireEvent.click(screen.getByText(/Analyser le fichier/i));

    await waitFor(() => {
      expect(screen.getByText('Récapitulatif de l’importation')).toBeInTheDocument();
      expect(screen.getByText('Prix invalide')).toBeInTheDocument();
      expect(screen.getByText(/Aucune ligne importable/i)).toBeInTheDocument();
    });

    expect(MenuImportClientService.startMenuFileImport).not.toHaveBeenCalled();
  });

  test('aborts an in-flight upload when Annuler is clicked', async () => {
    (MenuImportClientService.uploadMenuImportFile as jest.Mock).mockImplementationOnce(
      () => new Promise(() => undefined)
    );

    render(<BulkCsvImportModal {...defaultProps} />);

    const file = new File(['name,price\nPizza,12'], 'menu.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [file] } });
    fireEvent.click(screen.getByText(/Analyser le fichier/i));

    await waitFor(() => {
      expect(MenuImportClientService.uploadMenuImportFile).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText('Annuler'));

    const uploadOptions = (MenuImportClientService.uploadMenuImportFile as jest.Mock).mock.calls[0][3];
    expect(uploadOptions.signal.aborted).toBe(true);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    expect(MenuImportClientService.startMenuFileImport).not.toHaveBeenCalled();
  });
});

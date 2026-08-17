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
    expect(screen.getByText(/Télécharger le modèle CSV/i)).toBeInTheDocument();
  });

  test('does not render when isOpen is false', () => {
    const { container } = render(<BulkCsvImportModal {...defaultProps} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  test('triggers downloadSampleCsvTemplate on template button click', () => {
    render(<BulkCsvImportModal {...defaultProps} />);
    const downloadBtn = screen.getByText(/Télécharger le modèle CSV/i);
    fireEvent.click(downloadBtn);
    expect(MenuImportClientService.downloadSampleCsvTemplate).toHaveBeenCalledTimes(1);
  });

  test('handles file upload and triggers import flow', async () => {
    (MenuImportClientService.uploadMenuImportFile as jest.Mock).mockResolvedValueOnce({
      importId: 'imp-456',
      filePath: 'menu-imports/resto-123/imp-456.csv',
      type: 'csv',
    });
    (MenuImportClientService.startMenuFileImport as jest.Mock).mockResolvedValueOnce({
      importId: 'imp-456',
    });
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

    const importBtn = screen.getByText("Lancer l'importation");
    fireEvent.click(importBtn);

    await waitFor(() => {
      expect(MenuImportClientService.uploadMenuImportFile).toHaveBeenCalledWith(
        'resto-123',
        expect.any(File),
        expect.any(Function)
      );
      expect(MenuImportClientService.startMenuFileImport).toHaveBeenCalled();
      expect(defaultProps.onImportCompleted).toHaveBeenCalled();
    });
  });
});

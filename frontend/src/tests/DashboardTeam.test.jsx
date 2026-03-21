import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import Dashboard from '../pages/Dashboard';
import api from '../services/api';
import { AuthProvider } from '../components/AuthContext';
import { BrowserRouter } from 'react-router-dom';

vi.mock('../services/api');
vi.mock('../components/AuthContext', () => ({
  useAuth: () => ({ logout: vi.fn() }),
  AuthProvider: ({ children }) => <div>{children}</div>
}));

const mockResources = [
  { id: 1, name: 'Adrian Dias', role: 'Desenvolvedor', color_code: '#3b82f6', is_active: true }
];

describe('Dashboard - Aba Equipe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation((url) => {
      if (url === '/api/resources') return Promise.resolve({ data: mockResources });
      if (url === '/api/settings') return Promise.resolve({ data: { app_name: 'Squad Master Hub' } });
      // Novos mocks necessários para a aba de férias renderizar em paz
      if (url === '/api/holidays') return Promise.resolve({ data: [] });
      if (url === '/api/absences') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
  });

  const renderDashboard = () => render(
    <BrowserRouter>
      <Dashboard />
    </BrowserRouter>
  );

  it('deve alternar para a aba equipe e exibir os integrantes', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.queryByclassName?.includes('animate-spin')).toBeFalsy());
    fireEvent.click(screen.getByRole('button', { name: /EQUIPE/i }));
    expect(await screen.findByText('Adrian Dias')).toBeDefined();
  });

  it('deve preencher o formulário para adicionar novo membro', async () => {
    api.post.mockResolvedValue({ data: { id: 2, name: 'Novo Dev' } });
    renderDashboard();
    
    await screen.findByText('Squad Master Hub');
    fireEvent.click(screen.getByRole('button', { name: /EQUIPE/i }));

    const nameInput = await screen.findByPlaceholderText('Nome Completo');
    fireEvent.change(nameInput, { target: { value: 'Novo Dev' } });

    fireEvent.click(screen.getByRole('button', { name: /Adicionar Integrante/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/resources', expect.objectContaining({ name: 'Novo Dev' }));
    });
  });

  it('deve entrar em modo de edição ao clicar no ícone correspondente', async () => {
    renderDashboard();
    fireEvent.click(await screen.findByRole('button', { name: /EQUIPE/i }));
    
    const editBtn = await screen.findByText('✎');
    fireEvent.click(editBtn);
    expect(screen.getByText(/Editar Integrante/i)).toBeDefined();
  });

  it('deve filtrar a lista de integrantes pelo nome ou cargo', async () => {
    const multipleResources = [
      { id: 1, name: 'Adrian Dias', role: 'Desenvolvedor', color_code: '#3b82f6', is_active: true },
      { id: 2, name: 'Vitor Cardoso', role: 'QA', color_code: '#ef4444', is_active: true }
    ];
    
    api.get.mockImplementation((url) => {
      if (url === '/api/resources') return Promise.resolve({ data: multipleResources });
      if (url === '/api/settings') return Promise.resolve({ data: { app_name: 'Squad Master Hub' } });
      if (url === '/api/holidays') return Promise.resolve({ data: [] });
      if (url === '/api/absences') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });

    renderDashboard();

    fireEvent.click(await screen.findByRole('button', { name: /EQUIPE/i }));
    await screen.findByText('Adrian Dias');
    await screen.findByText('Vitor Cardoso');

    const searchInput = screen.getByPlaceholderText(/Filtre tudo aqui.../i);
    fireEvent.change(searchInput, { target: { value: 'Vitor' } });

    await waitFor(() => {
      expect(screen.queryByText('Adrian Dias')).toBeNull();
      expect(screen.getByText('Vitor Cardoso')).toBeDefined();
    });
  });
});

// --- NOVOS TESTES DA ABA DE FÉRIAS ---
describe('Dashboard - Aba Férias', () => {
  const renderDashboard = () => render(
    <BrowserRouter>
      <Dashboard />
    </BrowserRouter>
  );

  it('deve abrir o modal de nova ausência pelo botão principal e fechar ao cancelar', async () => {
    renderDashboard();
    await screen.findByText('Squad Master Hub');
    
    // Navega para Férias
    fireEvent.click(screen.getByRole('button', { name: /Férias/i }));
    
    // Abre modal de criação manual
    fireEvent.click(await screen.findByRole('button', { name: /\+ Nova Ausência/i }));
    expect(await screen.findByText('Agendar Ausência')).toBeDefined();
    
    // Cancela e verifica se desmontou
    fireEvent.click(screen.getByRole('button', { name: /Cancelar/i }));
    await waitFor(() => expect(screen.queryByText('Agendar Ausência')).toBeNull());
  });

  it('deve abrir o modal de gerenciar lançamentos e exibir empty state', async () => {
    renderDashboard();
    await screen.findByText('Squad Master Hub');
    
    fireEvent.click(screen.getByRole('button', { name: /Férias/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Gerenciar Lançamentos/i }));
    
    // Verifica se a tabela de auditoria abriu vazia (pois o mock de absences retorna [])
    expect(await screen.findByText(/Nenhum lançamento de ausência encontrado/i)).toBeDefined();
  });
});
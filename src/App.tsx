import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
import { ApiProvider } from './contexts/ApiContext';
import { SettingsProvider } from './contexts/SettingsContext';
import Index from './pages/Index';
import Tasks from './pages/Tasks';
import Workspace from './pages/Workspace';
import { CommandPalette } from './components/CommandPalette';
import { OnboardingScreen, isOnboardingComplete } from './components/OnboardingScreen';
import type { FC } from 'react';
import { useState, useEffect } from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      staleTime: 0,
      gcTime: 1000 * 60 * 5,
      notifyOnChangeProps: 'all',
    },
    mutations: {
      onSuccess: () => {
        queryClient.invalidateQueries();
      },
    },
  },
});

const App: FC = () => {
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    setShowOnboarding(!isOnboardingComplete());
  }, []);

  if (showOnboarding) {
    return (
      <SettingsProvider>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <OnboardingScreen onComplete={() => setShowOnboarding(false)} />
        </ThemeProvider>
      </SettingsProvider>
    );
  }

  return (
    <SettingsProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <ApiProvider queryClient={queryClient}>
              <BrowserRouter
                basename={import.meta.env.BASE_URL}
                future={{
                  v7_startTransition: true,
                  v7_relativeSplatPath: true,
                }}
              >
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/chat" element={<Index />} />
                  <Route path="/chat/:id" element={<Index />} />
                  <Route path="/tasks" element={<Tasks />} />
                  <Route path="/tasks/:id" element={<Tasks />} />
                  <Route path="/workspace/:id" element={<Workspace />} />
                </Routes>
                <CommandPalette />
                <Toaster />
                <Sonner />
              </BrowserRouter>
            </ApiProvider>
          </TooltipProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SettingsProvider>
  );
};

export default App;

import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
import { ApiProvider } from './contexts/ApiContext';
import { SettingsProvider } from './contexts/SettingsContext';
import Index from './pages/Index';
import { CommandPalette } from './components/CommandPalette';
import { OnboardingScreen, isOnboardingComplete } from './components/OnboardingScreen';
import type { FC } from 'react';
import { lazy, Suspense, useState } from 'react';
import { Loader2 } from 'lucide-react';

const TasksPage = lazy(() => import('./pages/Tasks'));
const WorkspacePage = lazy(() => import('./pages/Workspace'));

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
  // Lazy initializer: check localStorage on first render, not in useEffect.
  // Without this, ApiProvider mounts briefly before the effect fires, making
  // LNA-blocked requests to http://127.0.0.1:5700 from the HTTPS hosted page.
  const [showOnboarding, setShowOnboarding] = useState(() => !isOnboardingComplete());

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
                  <Route
                    path="/tasks"
                    element={
                      <Suspense
                        fallback={
                          <div className="flex h-screen items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                          </div>
                        }
                      >
                        <TasksPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/tasks/:id"
                    element={
                      <Suspense
                        fallback={
                          <div className="flex h-screen items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                          </div>
                        }
                      >
                        <TasksPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/workspace/:id"
                    element={
                      <Suspense
                        fallback={
                          <div className="flex h-screen items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                          </div>
                        }
                      >
                        <WorkspacePage />
                      </Suspense>
                    }
                  />
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

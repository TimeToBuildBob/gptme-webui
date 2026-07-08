import { type FC, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { CheckCircle2, Server, Cloud, Key, ArrowRight, ArrowLeft, Copy } from 'lucide-react';
import { toast } from 'sonner';

type Step = 'mode' | 'local-setup' | 'complete';

interface Props {
  onComplete: () => void;
}

const ONBOARDING_KEY = 'gptme-onboarding-complete';

export const isOnboardingComplete = (): boolean => {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === 'true';
  } catch {
    return false;
  }
};

export const completeOnboarding = () => {
  try {
    localStorage.setItem(ONBOARDING_KEY, 'true');
  } catch (e) {
    console.error('Failed to save onboarding state:', e);
  }
};

export const OnboardingScreen: FC<Props> = ({ onComplete }) => {
  const [step, setStep] = useState<Step>('mode');
  const [mode, setMode] = useState<'local' | 'cloud' | null>(null);
  const [baseUrl, setBaseUrl] = useState('http://127.0.0.1:5700');
  const [apiToken, setApiToken] = useState('');

  const serverCommand = `gptme-server --cors-origin='${window.location.origin}'`;
  const copyCommand = () => {
    navigator.clipboard.writeText(serverCommand);
    toast.success('Command copied to clipboard');
  };

  const handleModeSelect = (selected: 'local' | 'cloud') => {
    setMode(selected);
    setStep('local-setup');
  };

  const handleLocalSetup = () => {
    // Save the server config to localStorage so ApiContext picks it up
    try {
      localStorage.setItem('gptme_baseUrl', baseUrl);
      if (apiToken) {
        localStorage.setItem('gptme_userToken', apiToken);
      }
    } catch (e) {
      console.error('Failed to save config:', e);
    }
    setStep('complete');
  };

  const handleFinish = () => {
    completeOnboarding();
    onComplete();
  };

  return (
    <div className="flex h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-lg px-4">
        {/* Progress indicator */}
        <div className="mb-8 flex justify-center gap-2">
          {(['mode', 'local-setup', 'complete'] as Step[]).map((s) => (
            <div
              key={s}
              className={`h-2 w-16 rounded-full transition-colors ${
                step === s ? 'bg-blue-500' : 'bg-slate-200 dark:bg-slate-700'
              }`}
            />
          ))}
        </div>

        <Card className="shadow-xl">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">
              {step === 'mode' && 'Welcome to gptme'}
              {step === 'local-setup' && 'Set up Local Mode'}
              {step === 'complete' && "You're all set!"}
            </CardTitle>
            <CardDescription>
              {step === 'mode' && 'Choose how you want to connect'}
              {step === 'local-setup' && 'Configure your local gptme server'}
              {step === 'complete' && 'Start chatting with gptme'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step === 'mode' && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Select how you want to use gptme:</p>
                <RadioGroup
                  onValueChange={(v) => handleModeSelect(v as 'local' | 'cloud')}
                  className="grid gap-4"
                >
                  <div className="flex cursor-pointer items-start space-x-3 rounded-lg border p-4 transition-colors hover:border-blue-300">
                    <RadioGroupItem value="local" id="local" className="mt-1" />
                    <Label htmlFor="local" className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-2 font-medium">
                        <Server className="h-5 w-5" />
                        Local Server
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Run gptme-server yourself. More control, requires setup.
                      </p>
                    </Label>
                  </div>
                  <div className="flex cursor-pointer items-start space-x-3 rounded-lg border p-4 transition-colors hover:border-blue-300">
                    <RadioGroupItem value="cloud" id="cloud" className="mt-1" />
                    <Label htmlFor="cloud" className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-2 font-medium">
                        <Cloud className="h-5 w-5" />
                        Cloud Service
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Use gptme.ai hosted service. Quick start, no setup needed.
                      </p>
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            {step === 'local-setup' && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {mode === 'local'
                    ? 'Start your gptme server, then enter its URL below:'
                    : 'Cloud mode coming soon - use local mode for now.'}
                </p>
                {mode === 'local' && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Start the server with:</label>
                    <div className="flex items-center gap-2 rounded-md bg-muted p-2">
                      <code className="flex-1 break-all text-xs">{serverCommand}</code>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={copyCommand}
                        className="h-7 w-7 shrink-0"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      The <code className="rounded bg-muted px-1">--cors-origin</code> flag lets
                      this page connect to your local server securely.
                    </p>
                  </div>
                )}
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="baseUrl" className="text-xs">
                      Server URL
                    </Label>
                    <Input
                      id="baseUrl"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder="http://127.0.0.1:5700"
                    />
                  </div>
                  <div>
                    <Label htmlFor="apiToken" className="flex items-center gap-1 text-xs">
                      <Key className="h-3 w-3" />
                      API Token (optional)
                    </Label>
                    <Input
                      id="apiToken"
                      type="password"
                      value={apiToken}
                      onChange={(e) => setApiToken(e.target.value)}
                      placeholder="Leave empty for local development"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="ghost" onClick={() => setStep('mode')}>
                    <ArrowLeft className="mr-1 h-4 w-4" />
                    Back
                  </Button>
                  <Button className="flex-1" onClick={handleLocalSetup}>
                    Continue
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {step === 'complete' && (
              <div className="space-y-4 text-center">
                <div className="flex justify-center">
                  <CheckCircle2 className="h-16 w-16 text-green-500" />
                </div>
                <p className="text-sm text-muted-foreground">
                  You're ready to start using gptme. Happy chatting!
                </p>
                <Button className="w-full" onClick={handleFinish}>
                  Start Chatting
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

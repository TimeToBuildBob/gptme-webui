import { Monitor, Settings, Globe, FolderOpen } from 'lucide-react';
import type { FC } from 'react';
import { rightSidebarVisible$, rightSidebarActiveTab$ } from '@/stores/sidebar';
import { use$, useObservable } from '@legendapp/state/react';
import { NavigationIcons } from './NavigationIcons';

interface Props {
  conversationId: string;
}

const navItems = [
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'workspace', label: 'Workspace', icon: FolderOpen },
  { id: 'browser', label: 'Browser', icon: Globe },
  { id: 'computer', label: 'Computer', icon: Monitor },
];

export const RightSidebar: FC<Props> = ({ conversationId: _conversationId }) => {
  const activeTab$ = useObservable<string | null>(null);
  const activeTab = use$(activeTab$);

  const handleTabSelect = (tabId: string) => {
    console.log('handleTabSelect:', { tabId, activeTab, isEqual: tabId === activeTab });

    if (tabId === activeTab) {
      // If clicking the currently active tab, deselect it
      console.log('Deselecting tab - same tab clicked');
      activeTab$.set(null);
      rightSidebarVisible$.set(false);
      rightSidebarActiveTab$.set(null);
    } else {
      // Otherwise, switch to the new tab and show content
      console.log('Switching tab and showing content');
      activeTab$.set(tabId);
      rightSidebarVisible$.set(true);
      rightSidebarActiveTab$.set(tabId);
    }
  };

  return (
    <div className="flex h-full w-12 flex-col border-l bg-background p-1">
      <NavigationIcons
        navItems={navItems}
        activeTab={activeTab || ''}
        onTabSelect={handleTabSelect}
      />
    </div>
  );
};

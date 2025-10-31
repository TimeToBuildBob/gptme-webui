import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from './ui/command';
import { Plus, Search, Home } from 'lucide-react';

interface CommandAction {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  keywords: string[];
  action: () => void;
  group: string;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  // Toggle command palette with Cmd+K or Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  // Reset search when closing
  useEffect(() => {
    if (!open) {
      setSearch('');
    }
  }, [open]);

  // Define available actions
  const actions = useMemo<CommandAction[]>(
    () => [
      {
        id: 'new-conversation',
        label: 'New Conversation',
        description: 'Start a new chat',
        icon: <Plus className="mr-2 h-4 w-4" />,
        keywords: ['new', 'chat', 'conversation', 'create'],
        action: () => {
          navigate('/');
          setOpen(false);
        },
        group: 'Actions',
      },
      {
        id: 'search-conversations',
        label: 'Search Conversations',
        description: 'Find past chats',
        icon: <Search className="mr-2 h-4 w-4" />,
        keywords: ['search', 'find', 'conversations', 'history'],
        action: () => {
          // TODO: Implement search modal
          console.log('Search conversations');
          setOpen(false);
        },
        group: 'Actions',
      },
      {
        id: 'home',
        label: 'Home',
        description: 'Go to home page',
        icon: <Home className="mr-2 h-4 w-4" />,
        keywords: ['home', 'main'],
        action: () => {
          navigate('/');
          setOpen(false);
        },
        group: 'Navigation',
      },
    ],
    [navigate]
  );

  // Filter actions based on search query with performance optimization
  const filteredActions = useMemo(() => {
    if (!search) return actions;

    const searchLower = search.toLowerCase();
    return actions.filter((action) => {
      // Search in label
      if (action.label.toLowerCase().includes(searchLower)) return true;
      // Search in description
      if (action.description?.toLowerCase().includes(searchLower)) return true;
      // Search in keywords
      return action.keywords.some((keyword) => keyword.toLowerCase().includes(searchLower));
    });
  }, [search, actions]);

  // Group filtered actions by category
  const groupedActions = useMemo(() => {
    const groups = new Map<string, CommandAction[]>();
    filteredActions.forEach((action) => {
      const group = groups.get(action.group) || [];
      group.push(action);
      groups.set(action.group, group);
    });
    return Array.from(groups.entries());
  }, [filteredActions]);

  // Handle action execution with useCallback for performance
  const handleSelect = useCallback((action: CommandAction) => {
    action.action();
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Type a command or search..."
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {groupedActions.map(([groupName, groupActions], index) => (
          <div key={groupName}>
            {index > 0 && <CommandSeparator />}
            <CommandGroup heading={groupName}>
              {groupActions.map((action) => (
                <CommandItem
                  key={action.id}
                  value={action.id}
                  onSelect={() => handleSelect(action)}
                >
                  {action.icon}
                  <div className="flex flex-col">
                    <span>{action.label}</span>
                    {action.description && (
                      <span className="text-xs text-muted-foreground">{action.description}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </div>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

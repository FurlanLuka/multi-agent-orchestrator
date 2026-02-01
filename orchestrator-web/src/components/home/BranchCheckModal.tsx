import { useState } from 'react';
import {
  Modal,
  Stack,
  Text,
  Group,
  Button,
  ThemeIcon,
  Badge,
  Loader,
  Checkbox,
  Alert,
} from '@mantine/core';
import { IconGitBranch, IconAlertTriangle, IconFileCode } from '@tabler/icons-react';
import { GlassCard } from '../../theme';

interface BranchCheckResult {
  project: string;
  gitEnabled: boolean;
  currentBranch: string | null;
  mainBranch: string;
  isOnMainBranch: boolean;
  hasUncommittedChanges: boolean;
  uncommittedDetails?: { staged: number; unstaged: number; untracked: number };
}

interface BranchCheckModalProps {
  opened: boolean;
  results: BranchCheckResult[];
  checkoutingBranches: boolean;
  onCancel: () => void;
  onContinue: () => void;
  onCheckout: (stashFirst: boolean) => void;
}

export function BranchCheckModal({
  opened,
  results,
  checkoutingBranches,
  onCancel,
  onContinue,
  onCheckout,
}: BranchCheckModalProps) {
  const [stashChanges, setStashChanges] = useState(true);

  // Filter to only show projects that are NOT on their main branch
  const projectsNotOnMain = results.filter(
    r => r.gitEnabled && !r.isOnMainBranch && r.currentBranch
  );

  // Check if any project has uncommitted changes
  const projectsWithUncommitted = projectsNotOnMain.filter(r => r.hasUncommittedChanges);
  const hasUncommittedChanges = projectsWithUncommitted.length > 0;

  if (projectsNotOnMain.length === 0) {
    return null;
  }

  const formatUncommittedDetails = (details?: { staged: number; unstaged: number; untracked: number }) => {
    if (!details) return '';
    const parts: string[] = [];
    if (details.staged > 0) parts.push(`${details.staged} staged`);
    if (details.unstaged > 0) parts.push(`${details.unstaged} modified`);
    if (details.untracked > 0) parts.push(`${details.untracked} untracked`);
    return parts.join(', ');
  };

  return (
    <Modal
      opened={opened}
      onClose={onCancel}
      title={
        <Group gap="xs">
          <ThemeIcon color="yellow" variant="light" size="sm">
            <IconAlertTriangle size={14} />
          </ThemeIcon>
          <Text fw={600}>Branch Check</Text>
        </Group>
      }
      centered
      size="md"
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Some projects are not on their default branch. Starting a session from
          a feature branch may lead to merge conflicts later.
        </Text>

        <Stack gap="xs">
          {projectsNotOnMain.map(result => (
            <GlassCard key={result.project} p="sm">
              <Stack gap="xs">
                <Group justify="space-between" wrap="nowrap">
                  <Group gap="xs" wrap="nowrap">
                    <ThemeIcon color="gray" variant="light" size="sm">
                      <IconGitBranch size={14} />
                    </ThemeIcon>
                    <Text size="sm" fw={500}>
                      {result.project}
                    </Text>
                  </Group>
                  <Group gap="xs" wrap="nowrap">
                    <Badge size="sm" color="yellow" variant="light">
                      {result.currentBranch}
                    </Badge>
                    <Text size="xs" c="dimmed">
                      → {result.mainBranch}
                    </Text>
                  </Group>
                </Group>
                {result.hasUncommittedChanges && (
                  <Group gap="xs">
                    <ThemeIcon color="orange" variant="light" size="xs">
                      <IconFileCode size={12} />
                    </ThemeIcon>
                    <Text size="xs" c="orange">
                      Uncommitted changes: {formatUncommittedDetails(result.uncommittedDetails)}
                    </Text>
                  </Group>
                )}
              </Stack>
            </GlassCard>
          ))}
        </Stack>

        {hasUncommittedChanges && (
          <Alert color="orange" variant="light" icon={<IconAlertTriangle size={16} />}>
            <Text size="sm">
              Some projects have uncommitted changes. These must be stashed before switching branches.
            </Text>
            <Checkbox
              mt="xs"
              checked={stashChanges}
              onChange={(e) => setStashChanges(e.currentTarget.checked)}
              label="Stash uncommitted changes (recommended)"
              size="sm"
            />
          </Alert>
        )}

        <Text size="sm" fw={500}>
          What would you like to do?
        </Text>

        <Stack gap="xs">
          <Button
            variant="light"
            color="peach"
            fullWidth
            onClick={() => onCheckout(stashChanges)}
            loading={checkoutingBranches}
            disabled={hasUncommittedChanges && !stashChanges}
            leftSection={checkoutingBranches ? <Loader size={14} /> : <IconGitBranch size={16} />}
          >
            {checkoutingBranches
              ? 'Switching branches...'
              : hasUncommittedChanges && stashChanges
                ? `Stash & switch to default branch${projectsNotOnMain.length > 1 ? 'es' : ''}`
                : `Switch to default branch${projectsNotOnMain.length > 1 ? 'es' : ''}`}
          </Button>
          <Button
            variant="subtle"
            color="gray"
            fullWidth
            onClick={onContinue}
            disabled={checkoutingBranches}
          >
            Continue on current branch{projectsNotOnMain.length > 1 ? 'es' : ''}
          </Button>
          <Button
            variant="subtle"
            color="gray"
            fullWidth
            onClick={onCancel}
            disabled={checkoutingBranches}
          >
            Cancel
          </Button>
        </Stack>
      </Stack>
    </Modal>
  );
}

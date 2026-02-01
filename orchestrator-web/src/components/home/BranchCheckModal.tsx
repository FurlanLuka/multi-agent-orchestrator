import {
  Modal,
  Stack,
  Text,
  Group,
  Button,
  ThemeIcon,
  Badge,
  Loader,
} from '@mantine/core';
import { IconGitBranch, IconAlertTriangle } from '@tabler/icons-react';
import { GlassCard } from '../../theme';

interface BranchCheckResult {
  project: string;
  gitEnabled: boolean;
  currentBranch: string | null;
  mainBranch: string;
  isOnMainBranch: boolean;
}

interface BranchCheckModalProps {
  opened: boolean;
  results: BranchCheckResult[];
  checkoutingBranches: boolean;
  onCancel: () => void;
  onContinue: () => void;
  onCheckout: () => void;
}

export function BranchCheckModal({
  opened,
  results,
  checkoutingBranches,
  onCancel,
  onContinue,
  onCheckout,
}: BranchCheckModalProps) {
  // Filter to only show projects that are NOT on their main branch
  const projectsNotOnMain = results.filter(
    r => r.gitEnabled && !r.isOnMainBranch && r.currentBranch
  );

  if (projectsNotOnMain.length === 0) {
    return null;
  }

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
                    (default: {result.mainBranch})
                  </Text>
                </Group>
              </Group>
            </GlassCard>
          ))}
        </Stack>

        <Text size="sm" fw={500}>
          What would you like to do?
        </Text>

        <Stack gap="xs">
          <Button
            variant="light"
            color="peach"
            fullWidth
            onClick={onCheckout}
            loading={checkoutingBranches}
            leftSection={checkoutingBranches ? <Loader size={14} /> : <IconGitBranch size={16} />}
          >
            {checkoutingBranches
              ? 'Switching branches...'
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

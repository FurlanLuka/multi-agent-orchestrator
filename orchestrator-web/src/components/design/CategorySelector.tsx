import { Stack, Title, Text, SimpleGrid } from '@mantine/core';
import type { DesignCategory } from '@orchy/types';
import { FormCard, glass, radii } from '../../theme';

interface Category {
  id: DesignCategory;
  name: string;
  description: string;
}

interface CategorySelectorProps {
  categories: Category[];
  onSelect: (category: DesignCategory) => void;
}

export function CategorySelector({ categories, onSelect }: CategorySelectorProps) {
  return (
    <FormCard style={{ maxWidth: 600, width: '100%', margin: '0 24px' }}>
      <Stack gap="lg">
        <div>
          <Title order={3} fw={600} ta="center">
            What are you building?
          </Title>
          <Text size="sm" c="dimmed" ta="center">
            Select a category to get design recommendations
          </Text>
        </div>

        <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
          {categories.map((category) => (
            <CategoryCard
              key={category.id}
              category={category}
              onClick={() => onSelect(category.id)}
            />
          ))}
        </SimpleGrid>
      </Stack>
    </FormCard>
  );
}

interface CategoryCardProps {
  category: Category;
  onClick: () => void;
}

function CategoryCard({ category, onClick }: CategoryCardProps) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '16px',
        background: glass.surface.bg,
        border: glass.surface.border,
        borderRadius: radii.input,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255, 245, 242, 0.5)';
        e.currentTarget.style.borderColor = 'var(--mantine-color-peach-3)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = glass.surface.bg;
        e.currentTarget.style.borderColor = 'rgba(160, 130, 110, 0.1)';
      }}
    >
      <Text size="sm" fw={600} mb={4}>
        {category.name}
      </Text>
      <Text size="xs" c="dimmed">
        {category.description}
      </Text>
    </div>
  );
}

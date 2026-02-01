import { Container, Title, Text } from '@mantine/core';

function App() {
    return (
        <Container size="sm" py="xl">
            <Title order={1}>Welcome</Title>
            <Text c="dimmed" mt="md">
                Your app is ready. Start building!
            </Text>
        </Container>
    );
}

export default App;

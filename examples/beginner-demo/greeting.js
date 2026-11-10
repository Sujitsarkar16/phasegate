export function greet(name) {
  const recipient = typeof name === 'string' ? name.trim() : '';
  return `Hello, ${recipient || 'developer'}!`;
}

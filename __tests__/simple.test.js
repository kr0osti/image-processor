/**
 * @jest-environment node
 */

// This is a very simple test that doesn't rely on any imports or complex mocking
describe('Simple Test', () => {
  it('should pass', () => {
    expect(1 + 1).toBe(2);
  });

  it('should handle string concatenation', () => {
    expect('hello ' + 'world').toBe('hello world');
  });

  it('should handle arrays', () => {
    const arr = [1, 2, 3];
    expect(arr.length).toBe(3);
    expect(arr[0]).toBe(1);
  });
});

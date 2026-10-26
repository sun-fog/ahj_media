import parseCoordinates from '../coordinates';

describe('parseCoordinates', () => {
  test('координаты через запятую с пробелом', () => {
    expect(parseCoordinates('51.50851, -0.12572')).toEqual({
      latitude: 51.50851,
      longitude: -0.12572,
    });
  });

  test('координаты через запятую без пробела', () => {
    expect(parseCoordinates('51.50851,-0.12572')).toEqual({
      latitude: 51.50851,
      longitude: -0.12572,
    });
  });

  test('координаты в квадратных скобках', () => {
    expect(parseCoordinates('[51.50851, -0.12572]')).toEqual({
      latitude: 51.50851,
      longitude: -0.12572,
    });
  });

  test.each(['abc', '51.50851', '51.50851 -0.12572', '51,50851,-0.12572', ''])(
    'невалидный ввод "%s" бросает исключение',
    (value) => {
      expect(() => parseCoordinates(value)).toThrow();
    }
  );
});

export function formatRelativeDate(inputDate: Date | string | number): string {
  const date = new Date(inputDate);
  if (isNaN(date.getTime())) {
    throw new Error('Invalid date provided');
  }

  const now = Date.now();
  const diffInSeconds = Math.floor((now - date.getTime()) / 1000);

  if (diffInSeconds < 0) {
    return 'en el futuro'; // Manejo básico para fechas futuras
  }

  if (diffInSeconds < 60) {
    return 'hace unos segundos';
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `hace ${diffInMinutes} minuto${diffInMinutes > 1 ? 's' : ''}`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `hace ${diffInHours} hora${diffInHours > 1 ? 's' : ''}`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) {
    return `hace ${diffInDays} día${diffInDays > 1 ? 's' : ''}`;
  }

  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) {
    return `hace ${diffInMonths} mes${diffInMonths > 1 ? 'es' : ''}`;
  }

  const diffInYears = Math.floor(diffInDays / 365);
  return `hace ${diffInYears} año${diffInYears > 1 ? 's' : ''}`;
}

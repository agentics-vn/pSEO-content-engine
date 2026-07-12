import { useEffect, useState } from 'react';

export type Route =
  | { page: 'overview' }
  | { page: 'templates' }
  | { page: 'jobs' }
  | { page: 'review'; jobId: string }
  | { page: 'publish' };

export function parseRoute(hash: string): Route {
  const path = (hash.replace(/^#/, '') || '/').split('?')[0];
  const review = /^\/jobs\/([^/]+)\/review$/.exec(path);
  if (review) return { page: 'review', jobId: review[1] };
  switch (path) {
    case '/templates': return { page: 'templates' };
    case '/jobs': return { page: 'jobs' };
    case '/publish': return { page: 'publish' };
    default: return { page: 'overview' };
  }
}

export function routeHref(route: Route): string {
  switch (route.page) {
    case 'overview': return '#/';
    case 'templates': return '#/templates';
    case 'jobs': return '#/jobs';
    case 'publish': return '#/publish';
    case 'review': return `#/jobs/${route.jobId}/review`;
  }
}

export function navigate(route: Route) {
  window.location.hash = routeHref(route).slice(1);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parseRoute(window.location.hash));
  useEffect(() => {
    const onHash = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}

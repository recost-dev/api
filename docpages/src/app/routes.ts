import { createBrowserRouter } from 'react-router';
import { LandingLayout } from './layout/LandingLayout';
import { LandingPage } from './components/landing-page';
import About from './pages/About';
import Docs from './pages/Docs';
import Extension from './pages/Extension';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: LandingLayout,
    children: [
      { index: true, Component: LandingPage },
      { path: 'about', Component: About },
      { path: 'docs', Component: Docs },
      { path: 'extension', Component: Extension },
    ],
  },
]);

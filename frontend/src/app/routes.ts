import { createBrowserRouter } from 'react-router';
import { Layout } from './Layout';
import { CityInput } from './components/CityInput';
import { PriorityRanking } from './components/PriorityRanking';
import { PreferenceIntake } from './components/PreferenceIntake';
import { NeighborhoodRankings } from './components/NeighborhoodRankings';
import { HouseListings } from './components/HouseListings';
import { CostSummary } from './components/CostSummary';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, Component: CityInput },
      { path: 'priorities', Component: PriorityRanking },
      { path: 'preferences', Component: PreferenceIntake },
      { path: 'neighborhoods', Component: NeighborhoodRankings },
      { path: 'listings', Component: HouseListings },
      { path: 'summary', Component: CostSummary },
    ],
  },
]);

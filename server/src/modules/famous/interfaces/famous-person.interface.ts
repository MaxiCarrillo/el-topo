export interface FamousPerson {
  id: string;
  name: string;
  imageUrl: string;
  category?: FamousCategory;
}

export type FamousCategory =
  | 'actors'
  | 'singers'
  | 'athletes'
  | 'politicians'
  | 'others';

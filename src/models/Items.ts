export const ItemsTable = 'items';

export interface IItemsModel {
  id?: number;
  item_number: number;
  uid: string;
  held_by?: number;
}

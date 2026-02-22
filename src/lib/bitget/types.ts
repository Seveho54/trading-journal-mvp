export type BitgetResponse<T> = {
  code: string; // "00000"
  msg: string; // "success"
  requestTime?: number;
  data: T;
};

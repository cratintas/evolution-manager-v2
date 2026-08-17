"use client";

import { ColumnDef, StockFeatures, TableOptions, flexRender, stockFeatures, useTable } from "@tanstack/react-table";
import { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@evoapi/design-system/table";

import { cn } from "@/lib/utils";

interface DataTableProps<TData, TValue> extends Omit<TableOptions<StockFeatures, TData>, "data" | "columns" | "features"> {
  isLoading?: boolean;
  enableHeaders?: boolean;
  loadingMessage?: ReactNode;
  noResultsMessage?: ReactNode;
  columns: ColumnDef<StockFeatures, TData, TValue>[];
  data: TData[];
  className?: string;
  highlightedRows?: string[];
}

export function DataTable<TData, TValue>({ columns, data, isLoading, loadingMessage, noResultsMessage, enableHeaders = true, className, highlightedRows, ...options }: DataTableProps<TData, TValue>) {
  const { t } = useTranslation();
  const table = useTable({
    ...options,
    features: stockFeatures,
    data,
    columns,
  });

  return (
    <div className={cn("rounded-md border", className)}>
      <Table>
        {enableHeaders && (
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return <TableHead key={header.id}>{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</TableHead>;
                })}
              </TableRow>
            ))}
          </TableHeader>
        )}
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                {loadingMessage ?? t("table.loading")}
              </TableCell>
            </TableRow>
          ) : (
            <>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} data-state={row.getIsSelected() ? "selected" : highlightedRows?.includes(row.id) ? "highlighted" : ""}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    {noResultsMessage ?? t("table.noResults")}
                  </TableCell>
                </TableRow>
              )}
            </>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

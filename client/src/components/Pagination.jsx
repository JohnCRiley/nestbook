import { useT } from '../i18n/LocaleContext.jsx';

/**
 * Reusable pagination bar.
 *
 * Props:
 *   page        {number}   — current 1-based page number
 *   totalPages  {number}   — total number of pages
 *   total       {number}   — total record count
 *   limit       {number}   — records per page
 *   onPage      {fn}       — called with new page number when user navigates
 */
export default function Pagination({ page, totalPages, total, limit, onPage }) {
  const t = useT();

  if (!totalPages || totalPages <= 1) return null;

  const from = (page - 1) * limit + 1;
  const to   = Math.min(page * limit, total);

  return (
    <div className="pagination">
      <span className="pagination-info">
        {typeof t('showingXtoYofZ') === 'function'
          ? t('showingXtoYofZ')(from, to, total)
          : `${from}–${to} / ${total}`}
      </span>
      <div className="pagination-controls">
        <button
          className="pagination-btn"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
        >
          {t('prevPage')}
        </button>
        <span className="pagination-page">
          {typeof t('pageXofY') === 'function'
            ? t('pageXofY')(page, totalPages)
            : `${page} / ${totalPages}`}
        </span>
        <button
          className="pagination-btn"
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
        >
          {t('nextPage')}
        </button>
      </div>
    </div>
  );
}

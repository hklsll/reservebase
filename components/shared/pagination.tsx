import Link from 'next/link'

export function Pagination({ basePath, page, hasNextPage }: { basePath: string; page: number; hasNextPage: boolean }) {
  if (page === 1 && !hasNextPage) return null
  return <nav className="pagination" aria-label="Pagination"><span>Page {page}</span><div>{page > 1 && <Link className="outline-button" href={`${basePath}?page=${page - 1}`}>Previous</Link>}{hasNextPage && <Link className="outline-button" href={`${basePath}?page=${page + 1}`}>Next</Link>}</div></nav>
}

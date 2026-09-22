import { useState } from 'react';
import { Link } from 'react-router';
import { fetchAllStudents } from '../api/students.js';
import { useAuth } from '../auth/AuthContext.jsx';
import ExportButton from '../components/ExportButton.jsx';
import StudentForm from '../components/StudentForm.jsx';
import StudentsTable from '../components/StudentsTable.jsx';
import { studentsCsvRows } from '../lib/exports.js';
import { toIsoDate } from '../lib/format.js';
import { useDebouncedValue } from '../lib/useDebouncedValue.js';

function StudentsPage() {
  const { can } = useAuth();
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(1);
  const search = useDebouncedValue(searchText.trim(), 300);

  function handleSearchChange(event) {
    setSearchText(event.target.value);
    setPage(1);
  }

  return (
    <main>
      <h1>Students</h1>
      {can('staff') && (
        <section>
          <h2>Add a student</h2>
          <StudentForm />
          <p>
            <Link to="/students/import">Import many students from a CSV file…</Link>
          </p>
        </section>
      )}
      <section>
        <h2>All students</h2>
        <div className="toolbar">
          <input
            type="search"
            className="search"
            value={searchText}
            onChange={handleSearchChange}
            placeholder="Search by name or code"
            aria-label="Search students"
          />
          <ExportButton
            label="Export all students (CSV)"
            filename={`students-${toIsoDate(new Date())}.csv`}
            buildRows={async () => studentsCsvRows(await fetchAllStudents())}
          />
        </div>
        <StudentsTable search={search} page={page} onPageChange={setPage} />
      </section>
    </main>
  );
}

export default StudentsPage;
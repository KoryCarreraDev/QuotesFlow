// Los tests unitarios no tocan ninguna base de datos.
// Se apunta `DATABASE_URL` a una dirección inalcanzable para que un test unitario que,
// por error, llegue a Prisma falle en lugar de escribir en la base de datos de desarrollo del `.env`.

process.env.DATABASE_URL = 'postgresql://unit-tests:unit-tests@127.0.0.1:1/unit_tests_must_not_use_a_database';

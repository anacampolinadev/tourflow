# availability

Sprint 05: calendário e consulta determinística de planeamento. domain.ts contém validação e tempo local/UTC; engine.ts recebe snapshot/now e calcula motivos, candidatos e alternativas; service.ts assegura tenant/RBAC, snapshots consistentes e escritas transacionais com calendarVersion. API pública em index.ts. Não cria reservas ou decide dispatch; não valida documentação individual. Ver docs/SPRINT_05.md antes de integrar Booking.

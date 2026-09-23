import { Migration } from '@mikro-orm/migrations';

export class Migration20260922000000_CreateSchedulerSchema extends Migration {
  override async up(): Promise<void> {
    this.addSql('create extension if not exists btree_gist;');

    this.addSql(`
      create table customers (
        id uuid primary key,
        name text not null check (length(trim(name)) > 0)
      );
    `);

    this.addSql(`
      create table users (
        id uuid primary key,
        username text not null,
        password_hash text not null,
        customer_id uuid not null,
        constraint users_username_unique unique (username),
        constraint users_customer_id_unique unique (customer_id),
        constraint users_customer_id_foreign
          foreign key (customer_id) references customers (id)
          on update cascade on delete restrict
      );
    `);

    this.addSql(`
      create table vehicles (
        id uuid primary key,
        customer_id uuid not null,
        registration text not null check (length(trim(registration)) > 0),
        constraint vehicles_customer_id_foreign
          foreign key (customer_id) references customers (id)
          on update cascade on delete restrict,
        constraint vehicles_id_customer_id_unique unique (id, customer_id)
      );
    `);

    this.addSql(`
      create table dealerships (
        id uuid primary key,
        name text not null check (length(trim(name)) > 0),
        time_zone text not null check (length(trim(time_zone)) > 0)
      );
    `);

    this.addSql(`
      create table opening_hours (
        id uuid primary key,
        dealership_id uuid not null,
        day_of_week smallint not null check (day_of_week between 1 and 7),
        opens_at char(5) not null
          check (opens_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
        closes_at char(5) not null
          check (closes_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
        constraint opening_hours_same_day_interval_check check (opens_at < closes_at),
        constraint opening_hours_dealership_day_unique unique (dealership_id, day_of_week),
        constraint opening_hours_dealership_id_foreign
          foreign key (dealership_id) references dealerships (id)
          on update cascade on delete restrict
      );
    `);

    this.addSql(`
      create table services (
        id uuid primary key,
        name text not null check (length(trim(name)) > 0),
        duration_minutes integer not null check (duration_minutes > 0)
      );
    `);

    this.addSql(`
      create table technicians (
        id uuid primary key,
        dealership_id uuid not null,
        name text not null check (length(trim(name)) > 0),
        constraint technicians_dealership_id_foreign
          foreign key (dealership_id) references dealerships (id)
          on update cascade on delete restrict,
        constraint technicians_id_dealership_id_unique unique (id, dealership_id)
      );
    `);

    this.addSql(`
      create table technician_services (
        technician_id uuid not null,
        service_id uuid not null,
        primary key (technician_id, service_id),
        constraint technician_services_technician_id_foreign
          foreign key (technician_id) references technicians (id)
          on update cascade on delete restrict,
        constraint technician_services_service_id_foreign
          foreign key (service_id) references services (id)
          on update cascade on delete restrict
      );
    `);

    this.addSql(`
      create table bays (
        id uuid primary key,
        dealership_id uuid not null,
        name text not null check (length(trim(name)) > 0),
        constraint bays_dealership_id_foreign
          foreign key (dealership_id) references dealerships (id)
          on update cascade on delete restrict,
        constraint bays_id_dealership_id_unique unique (id, dealership_id)
      );
    `);

    this.addSql(`
      create table appointments (
        id uuid primary key,
        customer_id uuid not null,
        vehicle_id uuid not null,
        dealership_id uuid not null,
        service_id uuid not null,
        technician_id uuid not null,
        bay_id uuid not null,
        starts_at timestamptz(3) not null,
        ends_at timestamptz(3) not null,
        duration_minutes integer not null check (duration_minutes > 0),
        status text not null,
        created_at timestamptz(3) not null default clock_timestamp(),
        cancelled_at timestamptz(3),
        cancellation_reason text,
        idempotency_key text not null,
        request_hash text not null,
        constraint appointments_status_check
          check (status in ('CONFIRMED', 'CANCELLED')),
        constraint appointments_time_order_check
          check (starts_at < ends_at),
        constraint appointments_cancellation_reason_length_check
          check (cancellation_reason is null or char_length(cancellation_reason) <= 500),
        constraint appointments_cancellation_state_check
          check (
            (status = 'CONFIRMED' and cancelled_at is null and cancellation_reason is null)
            or
            (status = 'CANCELLED' and cancelled_at is not null)
          ),
        constraint appointments_idempotency_key_check
          check (idempotency_key ~ '^[\\x21-\\x7e]{1,128}$'),
        constraint appointments_request_hash_check
          check (request_hash ~ '^[0-9a-f]{64}$'),
        constraint appointments_customer_idempotency_unique
          unique (customer_id, idempotency_key),
        constraint appointments_customer_id_foreign
          foreign key (customer_id) references customers (id)
          on update cascade on delete restrict,
        constraint appointments_dealership_id_foreign
          foreign key (dealership_id) references dealerships (id)
          on update cascade on delete restrict,
        constraint appointments_service_id_foreign
          foreign key (service_id) references services (id)
          on update cascade on delete restrict,
        constraint appointments_vehicle_customer_foreign
          foreign key (vehicle_id, customer_id) references vehicles (id, customer_id)
          on update cascade on delete restrict,
        constraint appointments_technician_dealership_foreign
          foreign key (technician_id, dealership_id) references technicians (id, dealership_id)
          on update cascade on delete restrict,
        constraint appointments_bay_dealership_foreign
          foreign key (bay_id, dealership_id) references bays (id, dealership_id)
          on update cascade on delete restrict,
        constraint appointments_technician_service_foreign
          foreign key (technician_id, service_id) references technician_services (technician_id, service_id)
          on update cascade on delete restrict
      );
    `);

    this.addSql(`
      alter table appointments
      add constraint appointments_technician_no_overlap
      exclude using gist (
        dealership_id with =,
        technician_id with =,
        tstzrange(starts_at, ends_at, '[)') with &&
      )
      where (status = 'CONFIRMED');
    `);

    this.addSql(`
      alter table appointments
      add constraint appointments_bay_no_overlap
      exclude using gist (
        dealership_id with =,
        bay_id with =,
        tstzrange(starts_at, ends_at, '[)') with &&
      )
      where (status = 'CONFIRMED');
    `);

    this.addSql(`
      alter table appointments
      add constraint appointments_vehicle_no_overlap
      exclude using gist (
        vehicle_id with =,
        tstzrange(starts_at, ends_at, '[)') with &&
      )
      where (status = 'CONFIRMED');
    `);

    this.addSql(
      'create index appointments_customer_id_idx on appointments (customer_id);',
    );
    this.addSql(
      'create index appointments_dealership_id_starts_at_idx on appointments (dealership_id, starts_at);',
    );
    this.addSql(
      'create index appointments_vehicle_id_starts_at_idx on appointments (vehicle_id, starts_at);',
    );
    this.addSql('create index bays_dealership_id_idx on bays (dealership_id);');
    this.addSql(
      'create index opening_hours_dealership_id_idx on opening_hours (dealership_id);',
    );
    this.addSql(
      'create index technician_services_service_id_idx on technician_services (service_id);',
    );
    this.addSql(
      'create index technicians_dealership_id_idx on technicians (dealership_id);',
    );
    this.addSql(
      'create index vehicles_customer_id_idx on vehicles (customer_id);',
    );
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists appointments;');
    this.addSql('drop table if exists bays;');
    this.addSql('drop table if exists technician_services;');
    this.addSql('drop table if exists technicians;');
    this.addSql('drop table if exists services;');
    this.addSql('drop table if exists opening_hours;');
    this.addSql('drop table if exists dealerships;');
    this.addSql('drop table if exists vehicles;');
    this.addSql('drop table if exists users;');
    this.addSql('drop table if exists customers;');
    this.addSql('drop extension if exists btree_gist;');
  }
}

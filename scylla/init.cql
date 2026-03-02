CREATE KEYSPACE IF NOT EXISTS irctc
WITH replication = {
  'class': 'SimpleStrategy',
  'replication_factor': 1
};

USE irctc;

CREATE TABLE IF NOT EXISTS availability (
  route text,
  travel_date text,
  train_no text,
  available_seats int,
  PRIMARY KEY ((route, travel_date), train_no)
);

-- Insert sample data for testing
INSERT INTO availability (route, travel_date, train_no, available_seats) VALUES ('DEL-MUM', '2024-12-25', '12951', 120);
INSERT INTO availability (route, travel_date, train_no, available_seats) VALUES ('DEL-MUM', '2024-12-25', '12953', 85);
INSERT INTO availability (route, travel_date, train_no, available_seats) VALUES ('DEL-MUM', '2024-12-25', '12955', 200);
INSERT INTO availability (route, travel_date, train_no, available_seats) VALUES ('DEL-MUM', '2024-12-25', '12957', 150);

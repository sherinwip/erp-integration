package com.technomile.erpconfigapi.repository;

import com.technomile.erpconfigapi.entity.Client;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ClientRepository extends JpaRepository<Client, String> {
}

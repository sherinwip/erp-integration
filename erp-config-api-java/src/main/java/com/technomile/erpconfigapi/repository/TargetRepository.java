package com.technomile.erpconfigapi.repository;

import com.technomile.erpconfigapi.entity.Target;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface TargetRepository extends JpaRepository<Target, String> {
    List<Target> findByClientId(String clientId);
    Optional<Target> findByClientIdAndTargetName(String clientId, String targetName);
}

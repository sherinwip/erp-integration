package com.technomile.erpconfigapi.repository;

import com.technomile.erpconfigapi.entity.Step;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface StepRepository extends JpaRepository<Step, Long> {
    List<Step> findByClientId(String clientId);
    Optional<Step> findByClientIdAndStepName(String clientId, String stepName);
}

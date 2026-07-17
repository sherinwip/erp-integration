package com.technomile.erpconfigapi.repository;

import com.technomile.erpconfigapi.entity.Pipeline;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PipelineRepository extends JpaRepository<Pipeline, String> {
    List<Pipeline> findByClientId(String clientId);
}
